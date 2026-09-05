import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	getPurchaseReceiptInputSchema,
	inventoryPositionInputSchema,
	purchaseReceiptDetailSchema,
	purchaseReceiptListInputSchema,
	receivePurchaseOrderInputSchema,
	type GetPurchaseReceiptInput,
	type InventoryPositionInput,
	type InventoryPositionResult,
	type PurchaseReceiptDetail,
	type PurchaseReceiptListInput,
	type PurchaseReceiptListResult,
	type ReceivePurchaseOrderInput
} from '@/lib/contracts/purchase-receipt'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { getPrisma } from '@/server/db/prisma'
import { allocateDocumentNumber } from '@/server/documents/sequences'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import { assertNotFutureBusinessDate } from '@/server/business/dates'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type PurchaseTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the purchase receipt details.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown, requestId?: string): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError(requestId) }
	}

	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'The purchase receipt request could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function businessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function fulfillmentType(kinds: Array<'GOODS' | 'SERVICE' | 'COMBO'>) {
	const hasInventory = kinds.some((kind) => kind !== 'SERVICE')
	const hasService = kinds.some((kind) => kind === 'SERVICE')
	if (hasInventory && hasService) return 'MIXED' as const
	return hasService ? ('SERVICE_ACCEPTANCE' as const) : ('GOODS_RECEIPT' as const)
}

async function loadPurchaseReceiptDetail(
	transaction: PurchaseTransaction,
	businessId: string,
	purchaseReceiptId: string
): Promise<PurchaseReceiptDetail> {
	const receipt = await transaction.purchaseReceipt.findFirst({
		where: { id: purchaseReceiptId, businessId },
		include: {
			createdBy: { select: { id: true, displayName: true } },
			lines: {
				include: { inventoryMovement: { select: { id: true } } },
				orderBy: [{ position: 'asc' }, { id: 'asc' }]
			}
		}
	})

	if (!receipt) {
		throw new ApplicationError('NOT_FOUND', 'This purchase receipt does not exist.')
	}

	return {
		id: receipt.id,
		receiptNumber: receipt.number,
		receiptDate: dateOnly(receipt.receiptDate),
		fulfillmentType: fulfillmentType(receipt.lines.map((line) => line.productKindSnapshot)),
		sourceOrder: {
			id: receipt.orderId,
			orderNumber: receipt.sourceOrderNumberSnapshot,
			orderDate: dateOnly(receipt.sourceOrderDateSnapshot)
		},
		vendor: { id: receipt.contactId, name: receipt.contactNameSnapshot },
		createdBy: receipt.createdBy,
		createdAt: receipt.createdAt.toISOString(),
		lines: receipt.lines.map((line) => ({
			id: line.id,
			position: line.position,
			sourceOrderLineId: line.sourceOrderLineId,
			productId: line.productId,
			productName: line.productNameSnapshot,
			productKind: line.productKindSnapshot,
			quantity: line.quantity.toFixed(4),
			inventoryMovementId: line.inventoryMovement?.id ?? null
		}))
	}
}

export async function receivePurchaseOrder(
	actor: Actor,
	input: ReceivePurchaseOrderInput
): Promise<ActionResult<PurchaseReceiptDetail>> {
	const parsed = receivePurchaseOrderInputSchema.safeParse(input)

	if (!parsed.success) return validationFailure(parsed.error)

	const operation = 'purchase_receipt.create'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		purchaseOrderId: parsed.data.purchaseOrderId,
		expectedRevision: parsed.data.expectedRevision,
		receiptDate: parsed.data.receiptDate
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = purchaseReceiptDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (receipt) => receipt.id,
			command: async (transaction, _accountingLockDate, businessTimezone) => {
				assertNotFutureBusinessDate(parsed.data.receiptDate, businessTimezone, 'Receipt date')
				const order = await transaction.order.findFirst({
					where: {
						id: parsed.data.purchaseOrderId,
						businessId: actor.businessId,
						kind: 'PURCHASE'
					},
					include: {
						contact: true,
						purchaseReceipt: { select: { id: true } },
						lines: {
							include: { product: true },
							orderBy: [{ position: 'asc' }, { id: 'asc' }]
						}
					}
				})

				if (!order) {
					throw new ApplicationError('NOT_FOUND', 'This purchase order does not exist.')
				}
				if (order.purchaseReceipt) {
					throw new ApplicationError('INVALID_STATE', 'This purchase order was already received.')
				}
				if (order.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and try again.'
					)
				}
				if (order.state !== 'CONFIRMED') {
					throw new ApplicationError(
						'INVALID_STATE',
						'Only confirmed purchase orders can be received.'
					)
				}
				if (parsed.data.receiptDate < dateOnly(order.orderDate)) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'The receipt date cannot be before the purchase order date.'
					)
				}
				if (
					order.contact.businessId !== actor.businessId ||
					order.lines.some((line) => line.product.businessId !== actor.businessId)
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The purchase order contains a dependency outside the current business.'
					)
				}

				const claimed = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'PURCHASE',
						state: 'CONFIRMED',
						revision: parsed.data.expectedRevision
					},
					data: { revision: { increment: 1 } }
				})

				if (claimed.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and try again.'
					)
				}

				const receiptNumber = await allocateDocumentNumber(
					transaction,
					actor.businessId,
					'PURCHASE_RECEIPT',
					parsed.data.receiptDate,
					'PR'
				)
				const receipt = await transaction.purchaseReceipt.create({
					data: {
						businessId: actor.businessId,
						orderId: order.id,
						contactId: order.contactId,
						number: receiptNumber,
						receiptDate: businessDate(parsed.data.receiptDate),
						sourceOrderNumberSnapshot: order.number,
						sourceOrderDateSnapshot: order.orderDate,
						contactNameSnapshot: order.contact.name,
						createdById: actor.userId
					},
					select: { id: true }
				})

				for (const orderLine of order.lines) {
					const receiptLine = await transaction.purchaseReceiptLine.create({
						data: {
							receiptId: receipt.id,
							sourceOrderLineId: orderLine.id,
							productId: orderLine.productId,
							productNameSnapshot: orderLine.productNameSnapshot,
							productKindSnapshot: orderLine.productKindSnapshot,
							quantity: orderLine.quantity,
							position: orderLine.position
						},
						select: { id: true }
					})

					if (orderLine.productKindSnapshot !== 'SERVICE') {
						await transaction.inventoryMovement.create({
							data: {
								businessId: actor.businessId,
								productId: orderLine.productId,
								purchaseReceiptLineId: receiptLine.id,
								movementDate: businessDate(parsed.data.receiptDate),
								quantityDelta: orderLine.quantity,
								productNameSnapshot: orderLine.productNameSnapshot
							}
						})
					}
				}

				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'purchase_receipt.created',
						targetType: 'PurchaseReceipt',
						targetId: receipt.id,
						requestId: parsed.data.operationKey,
						details: {
							receiptNumber,
							purchaseOrderId: order.id,
							purchaseOrderNumber: order.number
						}
					}
				})

				return loadPurchaseReceiptDetail(transaction, actor.businessId, receipt.id)
			}
		})

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function getPurchaseReceipt(
	actor: Actor,
	input: GetPurchaseReceiptInput
): Promise<ActionResult<PurchaseReceiptDetail>> {
	const parsed = getPurchaseReceiptInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadPurchaseReceiptDetail(transaction, actor.businessId, parsed.data.purchaseReceiptId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listPurchaseReceipts(
	actor: Actor,
	input: PurchaseReceiptListInput = {}
): Promise<ActionResult<PurchaseReceiptListResult>> {
	const parsed = purchaseReceiptListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.PurchaseReceiptWhereInput = {
					businessId: actor.businessId,
					receiptDate: {
						...(parsed.data.dateFrom ? { gte: businessDate(parsed.data.dateFrom) } : {}),
						...(parsed.data.dateTo ? { lte: businessDate(parsed.data.dateTo) } : {})
					}
				}
				const totalCount = await transaction.purchaseReceipt.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const receipts = await transaction.purchaseReceipt.findMany({
					where,
					include: {
						createdBy: { select: { id: true, displayName: true } },
						lines: { select: { productKindSnapshot: true } }
					},
					orderBy: [{ receiptDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})

				return {
					rows: receipts.map((receipt) => ({
						id: receipt.id,
						receiptNumber: receipt.number,
						receiptDate: dateOnly(receipt.receiptDate),
						fulfillmentType: fulfillmentType(receipt.lines.map((line) => line.productKindSnapshot)),
						sourceOrder: {
							id: receipt.orderId,
							orderNumber: receipt.sourceOrderNumberSnapshot,
							orderDate: dateOnly(receipt.sourceOrderDateSnapshot)
						},
						vendor: { id: receipt.contactId, name: receipt.contactNameSnapshot },
						createdBy: receipt.createdBy,
						createdAt: receipt.createdAt.toISOString()
					})),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies PurchaseReceiptListResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getInventoryPositions(
	actor: Actor,
	input: InventoryPositionInput = {}
): Promise<ActionResult<InventoryPositionResult>> {
	const parsed = inventoryPositionInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.ProductWhereInput = {
					businessId: actor.businessId,
					kind: { in: ['GOODS', 'COMBO'] },
					...(parsed.data.productId ? { id: parsed.data.productId } : {}),
					inventoryMovements: { some: { businessId: actor.businessId } }
				}
				const totalCount = await transaction.product.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const products = await transaction.product.findMany({
					where,
					select: { id: true, name: true, kind: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const quantities = await transaction.inventoryMovement.groupBy({
					by: ['productId'],
					where: { businessId: actor.businessId, productId: { in: products.map((p) => p.id) } },
					_sum: { quantityDelta: true }
				})
				const quantityByProduct = new Map(
					quantities.map((quantity) => [quantity.productId, quantity._sum.quantityDelta])
				)

				return {
					rows: products.map((product) => ({
						productId: product.id,
						productName: product.name,
						productKind: product.kind as 'GOODS' | 'COMBO',
						quantityOnHand: quantityByProduct.get(product.id)?.toFixed(4) ?? '0.0000'
					})),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies InventoryPositionResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
