import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	createPurchaseOrderInputSchema,
	getPurchaseOrderInputSchema,
	purchaseOrderDetailSchema,
	purchaseOrderListInputSchema,
	purchaseOrderTransitionInputSchema,
	updateDraftPurchaseOrderInputSchema,
	type CreatePurchaseOrderInput,
	type GetPurchaseOrderInput,
	type PurchaseOrderDetail,
	type PurchaseOrderListInput,
	type PurchaseOrderListResult,
	type PurchaseOrderSummary,
	type PurchaseOrderTransitionInput,
	type UpdateDraftPurchaseOrderInput
} from '@/lib/contracts/purchase-order'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	assertJournalAmountRange,
	formatJournalAmount,
	sumJournalAmounts,
	type JournalDecimal
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'

type PurchaseTransaction = Prisma.TransactionClient
type PurchaseOperation =
	'purchase_order.create' | 'purchase_order.confirm' | 'purchase_order.cancel'

type CanonicalLine = {
	productId: string
	quantity: JournalDecimal
	unitPrice: JournalDecimal
	lineTotal: JournalDecimal
}

type CanonicalCommercialInput = {
	vendorId: string
	orderDate: string
	lines: CanonicalLine[]
	total: JournalDecimal
}

const maximumTransactionAttempts = 10

function validationFailure(error: z.ZodError): ActionResult<never> {
	const fieldErrors: Record<string, string[]> = {}

	for (const issue of error.issues) {
		const path = issue.path.join('.') || 'form'
		fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message]
	}

	return {
		ok: false,
		error: { code: 'VALIDATION_ERROR', message: 'Check the purchase order details.', fieldErrors }
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
			message: 'The purchase order request could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function asBusinessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function isRetryableTransactionFailure(error: unknown) {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return false
	}

	const code = (error as { code?: unknown }).code
	return code === 'P2002' || code === 'P2034'
}

function waitBeforeTransactionRetry(attempt: number) {
	const delayMilliseconds = Math.min(25 * 2 ** (attempt - 1), 1000)
	return new Promise((resolve) => setTimeout(resolve, delayMilliseconds))
}

function requestHash(payload: object) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function calculateCommercialInput(input: {
	vendorId: string
	orderDate: string
	lines: Array<{ productId: string; quantity: string; unitPrice: string }>
}): CanonicalCommercialInput {
	const lines = input.lines.map((line) => {
		const quantity = new Prisma.Decimal(line.quantity)
		const unitPrice = new Prisma.Decimal(line.unitPrice)
		const lineTotal = new Prisma.Decimal(formatJournalAmount(quantity.times(unitPrice)))
		assertJournalAmountRange(lineTotal)

		return { productId: line.productId, quantity, unitPrice, lineTotal }
	})
	const total = sumJournalAmounts(lines.map((line) => line.lineTotal))
	assertJournalAmountRange(total)

	return { vendorId: input.vendorId, orderDate: input.orderDate, lines, total }
}

function canonicalCommercialPayload(input: CanonicalCommercialInput) {
	return {
		vendorId: input.vendorId,
		orderDate: input.orderDate,
		lines: input.lines.map((line) => ({
			productId: line.productId,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPrice.toFixed(4),
			lineTotal: formatJournalAmount(line.lineTotal)
		})),
		total: formatJournalAmount(input.total)
	}
}

async function requirePurchaseDependencies(
	transaction: PurchaseTransaction,
	businessId: string,
	input: CanonicalCommercialInput
) {
	const vendor = await transaction.contact.findFirst({
		where: { id: input.vendorId, businessId },
		select: { id: true, kind: true, archivedAt: true }
	})

	if (!vendor) {
		throw new ApplicationError('NOT_FOUND', 'The selected vendor was not found.')
	}

	if (vendor.archivedAt) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose an active vendor.')
	}

	if (vendor.kind !== 'VENDOR' && vendor.kind !== 'BOTH') {
		throw new ApplicationError('INVALID_STATE', 'Purchase orders require a Vendor or Both contact.')
	}

	const productIds = [...new Set(input.lines.map((line) => line.productId))]
	const products = await transaction.product.findMany({
		where: { id: { in: productIds }, businessId },
		select: { id: true, name: true, archivedAt: true }
	})

	if (products.length !== productIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected product was not found.')
	}

	if (products.some((product) => product.archivedAt)) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose active products.')
	}

	return new Map(products.map((product) => [product.id, product]))
}

async function allocatePurchaseOrderNumber(
	transaction: PurchaseTransaction,
	businessId: string,
	orderDate: string
) {
	const period = orderDate.slice(0, 4)
	const sequence = await transaction.documentSequence.upsert({
		where: {
			businessId_kind_period: { businessId, kind: 'PURCHASE_ORDER', period }
		},
		create: {
			businessId,
			kind: 'PURCHASE_ORDER',
			period,
			prefix: `PO/${period}`,
			nextNumber: BigInt('2')
		},
		update: { nextNumber: { increment: 1 } }
	})

	const number = sequence.nextNumber - BigInt('1')
	return `${sequence.prefix}/${number.toString().padStart(6, '0')}`
}

async function loadPurchaseOrderDetail(
	transaction: PurchaseTransaction,
	businessId: string,
	purchaseOrderId: string
): Promise<PurchaseOrderDetail> {
	const order = await transaction.order.findFirst({
		where: { id: purchaseOrderId, businessId, kind: 'PURCHASE' }
	})

	if (!order) {
		throw new ApplicationError('NOT_FOUND', 'This purchase order does not exist.')
	}

	const vendor = await transaction.contact.findFirst({
		where: { id: order.contactId, businessId },
		select: { id: true, name: true }
	})
	const creator = await transaction.applicationUser.findUnique({
		where: { id: order.createdById },
		select: { id: true, displayName: true }
	})
	const lines = await transaction.orderLine.findMany({
		where: { orderId: order.id },
		orderBy: [{ position: 'asc' }, { id: 'asc' }]
	})
	const receipt = await transaction.purchaseReceipt.findFirst({
		where: { orderId: order.id, businessId },
		select: { id: true, number: true, receiptDate: true }
	})
	const vendorBill = await transaction.financialDocument.findFirst({
		where: {
			sourceOrderId: order.id,
			businessId,
			kind: 'VENDOR_BILL',
			state: { not: 'CANCELLED' }
		},
		select: { id: true, number: true, state: true }
	})

	if (!vendor || !creator) {
		throw new ApplicationError('INVALID_STATE', 'The purchase order has an invalid owner.')
	}

	return {
		id: order.id,
		kind: 'PURCHASE',
		orderNumber: order.number,
		orderDate: dateOnly(order.orderDate),
		state: order.state,
		total: formatJournalAmount(order.total),
		revision: order.revision,
		vendor,
		createdBy: creator,
		createdAt: order.createdAt.toISOString(),
		updatedAt: order.updatedAt.toISOString(),
		receipt:
			receipt == null
				? null
				: {
						id: receipt.id,
						receiptNumber: receipt.number,
						receiptDate: dateOnly(receipt.receiptDate)
					},
		vendorBill:
			vendorBill == null
				? null
				: { id: vendorBill.id, billNumber: vendorBill.number, state: vendorBill.state },
		lines: lines.map((line) => ({
			id: line.id,
			position: line.position,
			productId: line.productId,
			productName: line.productNameSnapshot,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPriceSnapshot.toFixed(4),
			lineTotal: formatJournalAmount(line.lineTotal)
		}))
	}
}

async function loadPurchaseOrderSummaries(
	transaction: PurchaseTransaction,
	businessId: string,
	input: z.output<typeof purchaseOrderListInputSchema>
): Promise<PurchaseOrderListResult> {
	const where: Prisma.OrderWhereInput = {
		businessId,
		kind: 'PURCHASE',
		...(input.state === 'ALL' ? {} : { state: input.state })
	}
	const totalCount = await transaction.order.count({ where })
	const { page, lastPage } = resolvePage(input.page, input.pageSize, totalCount)
	const orders = await transaction.order.findMany({
		where,
		orderBy: [{ orderDate: 'desc' }, { id: 'asc' }],
		skip: (page - 1) * input.pageSize,
		take: input.pageSize
	})
	const vendorIds = [...new Set(orders.map((order) => order.contactId))]
	const creatorIds = [...new Set(orders.map((order) => order.createdById))]
	const vendors = await transaction.contact.findMany({
		where: { businessId, id: { in: vendorIds } },
		select: { id: true, name: true }
	})
	const creators = await transaction.applicationUser.findMany({
		where: { id: { in: creatorIds } },
		select: { id: true, displayName: true }
	})
	const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]))
	const creatorsById = new Map(creators.map((creator) => [creator.id, creator]))

	const rows = orders.map((order) => {
		const vendor = vendorsById.get(order.contactId)
		const creator = creatorsById.get(order.createdById)

		if (!vendor || !creator) {
			throw new ApplicationError('INVALID_STATE', 'A purchase order has an invalid owner.')
		}

		return {
			id: order.id,
			kind: 'PURCHASE' as const,
			orderNumber: order.number,
			orderDate: dateOnly(order.orderDate),
			state: order.state,
			total: formatJournalAmount(order.total),
			revision: order.revision,
			vendor,
			createdBy: creator,
			createdAt: order.createdAt.toISOString(),
			updatedAt: order.updatedAt.toISOString()
		} satisfies PurchaseOrderSummary
	})

	return { rows, totalCount, page, pageSize: input.pageSize, lastPage }
}

async function executeIdempotentPurchaseOperation(
	actor: Actor,
	operationKey: string,
	operation: PurchaseOperation,
	hash: string,
	command: (transaction: PurchaseTransaction) => Promise<PurchaseOrderDetail>
) {
	const database = getPrisma()

	for (let attempt = 1; attempt <= maximumTransactionAttempts; attempt += 1) {
		try {
			return await database.$transaction(
				async (transaction) => {
					await requireCurrentAccountingActor(transaction, actor, 'transactions:create')
					const existing = await transaction.commandOperation.findUnique({
						where: {
							businessId_operationKey: {
								businessId: actor.businessId,
								operationKey
							}
						}
					})

					if (existing) {
						if (existing.operation !== operation || existing.requestHash !== hash) {
							throw new ApplicationError(
								'OPERATION_KEY_MISMATCH',
								'This operation key was already used with a different request.'
							)
						}

						if (!existing.committedAt || !existing.result) {
							throw new ApplicationError('CONFLICT', 'The purchase order request is still running.')
						}

						const storedResult = purchaseOrderDetailSchema.safeParse(existing.result)
						if (!storedResult.success) {
							throw new ApplicationError(
								'INVALID_STATE',
								'The stored purchase order result is invalid.'
							)
						}

						return storedResult.data
					}

					await transaction.commandOperation.create({
						data: {
							businessId: actor.businessId,
							actorUserId: actor.userId,
							operationKey,
							operation,
							requestHash: hash
						}
					})

					const result = await command(transaction)
					await transaction.commandOperation.update({
						where: {
							businessId_operationKey: {
								businessId: actor.businessId,
								operationKey
							}
						},
						data: {
							resourceId: result.id,
							result: result as unknown as Prisma.InputJsonObject,
							committedAt: new Date()
						}
					})

					return result
				},
				{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
			)
		} catch (error) {
			if (isRetryableTransactionFailure(error) && attempt < maximumTransactionAttempts) {
				await waitBeforeTransactionRetry(attempt)
				continue
			}

			if (isRetryableTransactionFailure(error)) {
				throw new ApplicationError(
					'CONFLICT',
					'The purchase order request could not be serialized. Retry with the same operation key.'
				)
			}

			throw error
		}
	}

	throw new ApplicationError('INTERNAL_ERROR', 'The purchase order request did not complete.')
}

async function assertDraftOrder(
	transaction: PurchaseTransaction,
	businessId: string,
	purchaseOrderId: string,
	expectedRevision: number
) {
	const order = await transaction.order.findFirst({
		where: { id: purchaseOrderId, businessId, kind: 'PURCHASE' },
		select: { id: true, state: true, revision: true }
	})

	if (!order) {
		throw new ApplicationError('NOT_FOUND', 'This purchase order does not exist.')
	}

	if (order.revision !== expectedRevision) {
		throw new ApplicationError(
			'STALE_REVISION',
			'This purchase order changed. Reload it and review the current values.'
		)
	}

	if (order.state !== 'DRAFT') {
		throw new ApplicationError('INVALID_STATE', 'Only draft purchase orders can be changed.')
	}

	return order
}

async function transitionPurchaseOrder(
	actor: Actor,
	input: PurchaseOrderTransitionInput,
	targetState: 'CONFIRMED' | 'CANCELLED'
): Promise<ActionResult<PurchaseOrderDetail>> {
	const parsed = purchaseOrderTransitionInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	const operation: PurchaseOperation =
		targetState === 'CONFIRMED' ? 'purchase_order.confirm' : 'purchase_order.cancel'
	const hash = requestHash({
		operation,
		actorUserId: actor.userId,
		purchaseOrderId: parsed.data.purchaseOrderId,
		expectedRevision: parsed.data.expectedRevision
	})

	try {
		const result = await executeIdempotentPurchaseOperation(
			actor,
			parsed.data.operationKey,
			operation,
			hash,
			async (transaction) => {
				const order = await transaction.order.findFirst({
					where: {
						id: parsed.data.purchaseOrderId,
						businessId: actor.businessId,
						kind: 'PURCHASE'
					},
					select: { id: true, state: true, revision: true }
				})

				if (!order) {
					throw new ApplicationError('NOT_FOUND', 'This purchase order does not exist.')
				}

				if (order.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and review the current values.'
					)
				}

				if (targetState === 'CANCELLED') {
					const receipt = await transaction.purchaseReceipt.findUnique({
						where: { orderId: order.id },
						select: { id: true }
					})

					if (receipt) {
						throw new ApplicationError(
							'INVALID_STATE',
							'A received purchase order cannot be cancelled.'
						)
					}
				}

				const canTransition =
					targetState === 'CONFIRMED'
						? order.state === 'DRAFT'
						: order.state === 'DRAFT' || order.state === 'CONFIRMED'
				if (!canTransition) {
					throw new ApplicationError(
						'INVALID_STATE',
						`This purchase order cannot be ${targetState.toLowerCase()}.`
					)
				}

				const updated = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'PURCHASE',
						state: order.state,
						revision: parsed.data.expectedRevision
					},
					data: { state: targetState, revision: { increment: 1 } }
				})

				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and try again.'
					)
				}

				return loadPurchaseOrderDetail(transaction, actor.businessId, order.id)
			}
		)

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function listPurchaseOrders(
	actor: Actor,
	input: PurchaseOrderListInput = {}
): Promise<ActionResult<PurchaseOrderListResult>> {
	const parsed = purchaseOrderListInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				return loadPurchaseOrderSummaries(transaction, actor.businessId, parsed.data)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getPurchaseOrder(
	actor: Actor,
	input: GetPurchaseOrderInput
): Promise<ActionResult<PurchaseOrderDetail>> {
	const parsed = getPurchaseOrderInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadPurchaseOrderDetail(transaction, actor.businessId, parsed.data.purchaseOrderId)
		})

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function createPurchaseOrder(
	actor: Actor,
	input: CreatePurchaseOrderInput
): Promise<ActionResult<PurchaseOrderDetail>> {
	const parsed = createPurchaseOrderInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	try {
		const commercial = calculateCommercialInput(parsed.data)
		const operation = 'purchase_order.create'
		const hash = requestHash({
			operation,
			actorUserId: actor.userId,
			...canonicalCommercialPayload(commercial)
		})
		const result = await executeIdempotentPurchaseOperation(
			actor,
			parsed.data.operationKey,
			operation,
			hash,
			async (transaction) => {
				const products = await requirePurchaseDependencies(
					transaction,
					actor.businessId,
					commercial
				)
				const number = await allocatePurchaseOrderNumber(
					transaction,
					actor.businessId,
					commercial.orderDate
				)
				const order = await transaction.order.create({
					data: {
						businessId: actor.businessId,
						kind: 'PURCHASE',
						contactId: commercial.vendorId,
						number,
						orderDate: asBusinessDate(commercial.orderDate),
						total: formatJournalAmount(commercial.total),
						createdById: actor.userId
					},
					select: { id: true }
				})

				await transaction.orderLine.createMany({
					data: commercial.lines.map((line, index) => {
						const product = products.get(line.productId)

						if (!product) {
							throw new ApplicationError('INVALID_STATE', 'A selected product is unavailable.')
						}

						return {
							orderId: order.id,
							productId: line.productId,
							productNameSnapshot: product.name,
							quantity: line.quantity.toFixed(4),
							unitPriceSnapshot: line.unitPrice.toFixed(4),
							lineTotal: formatJournalAmount(line.lineTotal),
							position: index
						}
					})
				})

				return loadPurchaseOrderDetail(transaction, actor.businessId, order.id)
			}
		)

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function updateDraftPurchaseOrder(
	actor: Actor,
	input: UpdateDraftPurchaseOrderInput
): Promise<ActionResult<PurchaseOrderDetail>> {
	const parsed = updateDraftPurchaseOrderInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	try {
		const commercial = calculateCommercialInput(parsed.data)
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:create')
				await assertDraftOrder(
					transaction,
					actor.businessId,
					parsed.data.purchaseOrderId,
					parsed.data.expectedRevision
				)
				const products = await requirePurchaseDependencies(
					transaction,
					actor.businessId,
					commercial
				)
				const updated = await transaction.order.updateMany({
					where: {
						id: parsed.data.purchaseOrderId,
						businessId: actor.businessId,
						kind: 'PURCHASE',
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: {
						contactId: commercial.vendorId,
						orderDate: asBusinessDate(commercial.orderDate),
						total: formatJournalAmount(commercial.total),
						revision: { increment: 1 }
					}
				})

				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This purchase order changed. Reload it and try again.'
					)
				}

				await transaction.orderLine.deleteMany({
					where: { orderId: parsed.data.purchaseOrderId }
				})
				await transaction.orderLine.createMany({
					data: commercial.lines.map((line, index) => {
						const product = products.get(line.productId)

						if (!product) {
							throw new ApplicationError('INVALID_STATE', 'A selected product is unavailable.')
						}

						return {
							orderId: parsed.data.purchaseOrderId,
							productId: line.productId,
							productNameSnapshot: product.name,
							quantity: line.quantity.toFixed(4),
							unitPriceSnapshot: line.unitPrice.toFixed(4),
							lineTotal: formatJournalAmount(line.lineTotal),
							position: index
						}
					})
				})

				return loadPurchaseOrderDetail(transaction, actor.businessId, parsed.data.purchaseOrderId)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export function confirmPurchaseOrder(actor: Actor, input: PurchaseOrderTransitionInput) {
	return transitionPurchaseOrder(actor, input, 'CONFIRMED')
}

export function cancelPurchaseOrder(actor: Actor, input: PurchaseOrderTransitionInput) {
	return transitionPurchaseOrder(actor, input, 'CANCELLED')
}
