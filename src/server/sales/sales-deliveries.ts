import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	deliverSalesOrderInputSchema,
	getSalesDeliveryInputSchema,
	inventoryMovementListInputSchema,
	salesDeliveryDetailSchema,
	salesDeliveryListInputSchema,
	type DeliverSalesOrderInput,
	type GetSalesDeliveryInput,
	type InventoryMovementListInput,
	type InventoryMovementListResult,
	type SalesDeliveryDetail,
	type SalesDeliveryListInput,
	type SalesDeliveryListResult,
	type SalesDeliverySummary
} from '@/lib/contracts/sales-delivery'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { getPrisma } from '@/server/db/prisma'
import { allocateDocumentNumber } from '@/server/documents/sequences'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type SalesTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the sales delivery details.',
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
			message: 'The sales delivery request could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function businessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

async function loadSalesDeliveryDetail(
	transaction: SalesTransaction,
	businessId: string,
	salesDeliveryId: string
): Promise<SalesDeliveryDetail> {
	const delivery = await transaction.salesDelivery.findFirst({
		where: { id: salesDeliveryId, businessId },
		include: {
			createdBy: { select: { id: true, displayName: true } },
			lines: {
				include: { inventoryMovement: { select: { id: true } } },
				orderBy: [{ position: 'asc' }, { id: 'asc' }]
			}
		}
	})
	if (!delivery) throw new ApplicationError('NOT_FOUND', 'This sales delivery does not exist.')

	return {
		id: delivery.id,
		deliveryNumber: delivery.number,
		deliveryDate: dateOnly(delivery.deliveryDate),
		sourceOrder: {
			id: delivery.orderId,
			orderNumber: delivery.sourceOrderNumberSnapshot,
			orderDate: dateOnly(delivery.sourceOrderDateSnapshot)
		},
		customer: { id: delivery.contactId, name: delivery.contactNameSnapshot },
		createdBy: delivery.createdBy,
		createdAt: delivery.createdAt.toISOString(),
		lines: delivery.lines.map((line) => ({
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

async function assertStockAvailable(
	transaction: SalesTransaction,
	businessId: string,
	deliveryDate: string,
	requiredByProduct: Map<string, Prisma.Decimal>
) {
	for (const [productId, required] of requiredByProduct) {
		const movements = await transaction.inventoryMovement.findMany({
			where: { businessId, productId },
			select: { movementDate: true, quantityDelta: true },
			orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
		})
		const dailyChanges = new Map<string, Prisma.Decimal>()
		for (const movement of movements) {
			const date = dateOnly(movement.movementDate)
			dailyChanges.set(
				date,
				(dailyChanges.get(date) ?? new Prisma.Decimal('0')).plus(movement.quantityDelta)
			)
		}

		let running = new Prisma.Decimal('0')
		let availableOnDate = new Prisma.Decimal('0')
		let minimumAfterDate: Prisma.Decimal | null = null
		for (const [date, change] of [...dailyChanges.entries()].sort(([left], [right]) =>
			left.localeCompare(right)
		)) {
			running = running.plus(change)
			if (date <= deliveryDate) availableOnDate = running
			if (date >= deliveryDate && (!minimumAfterDate || running.lessThan(minimumAfterDate))) {
				minimumAfterDate = running
			}
		}

		const safeFutureBalance =
			minimumAfterDate && minimumAfterDate.lessThan(availableOnDate)
				? minimumAfterDate
				: availableOnDate
		if (availableOnDate.lessThan(required) || safeFutureBalance.lessThan(required)) {
			throw new ApplicationError(
				'INVALID_STATE',
				'Insufficient stock is available on the delivery date without making later stock negative.'
			)
		}
	}
}

export async function deliverSalesOrder(
	actor: Actor,
	input: DeliverSalesOrderInput
): Promise<ActionResult<SalesDeliveryDetail>> {
	const parsed = deliverSalesOrderInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'sales_delivery.create'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		salesOrderId: parsed.data.salesOrderId,
		expectedRevision: parsed.data.expectedRevision,
		deliveryDate: parsed.data.deliveryDate
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = salesDeliveryDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (delivery) => delivery.id,
			command: async (transaction) => {
				const order = await transaction.order.findFirst({
					where: { id: parsed.data.salesOrderId, businessId: actor.businessId, kind: 'SALES' },
					include: {
						contact: true,
						salesDelivery: { select: { id: true } },
						lines: {
							include: { product: { select: { businessId: true } } },
							orderBy: [{ position: 'asc' }, { id: 'asc' }]
						}
					}
				})
				if (!order) throw new ApplicationError('NOT_FOUND', 'This Sales Order does not exist.')
				if (order.salesDelivery) {
					throw new ApplicationError('INVALID_STATE', 'This Sales Order was already delivered.')
				}
				if (order.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}
				if (order.state !== 'CONFIRMED') {
					throw new ApplicationError(
						'INVALID_STATE',
						'Only confirmed Sales Orders can be delivered.'
					)
				}
				if (parsed.data.deliveryDate < dateOnly(order.orderDate)) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'The delivery date cannot be before the Sales Order date.'
					)
				}
				if (
					order.contact.businessId !== actor.businessId ||
					order.lines.some((line) => line.product.businessId !== actor.businessId)
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The Sales Order contains a dependency outside the current business.'
					)
				}
				if (
					order.contact.archivedAt ||
					(order.contact.kind !== 'CUSTOMER' && order.contact.kind !== 'BOTH')
				) {
					throw new ApplicationError(
						'ARCHIVED_DEPENDENCY',
						'The Sales Order customer is unavailable.'
					)
				}

				const requiredByProduct = new Map<string, Prisma.Decimal>()
				for (const line of order.lines) {
					if (line.productKindSnapshot !== 'SERVICE') {
						requiredByProduct.set(
							line.productId,
							(requiredByProduct.get(line.productId) ?? new Prisma.Decimal('0')).plus(line.quantity)
						)
					}
				}
				await assertStockAvailable(
					transaction,
					actor.businessId,
					parsed.data.deliveryDate,
					requiredByProduct
				)

				const claimed = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'SALES',
						state: 'CONFIRMED',
						revision: parsed.data.expectedRevision
					},
					data: { revision: { increment: 1 } }
				})
				if (claimed.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}

				const deliveryNumber = await allocateDocumentNumber(
					transaction,
					actor.businessId,
					'SALES_DELIVERY',
					parsed.data.deliveryDate,
					'DEL'
				)
				const delivery = await transaction.salesDelivery.create({
					data: {
						businessId: actor.businessId,
						orderId: order.id,
						contactId: order.contactId,
						number: deliveryNumber,
						deliveryDate: businessDate(parsed.data.deliveryDate),
						sourceOrderNumberSnapshot: order.number,
						sourceOrderDateSnapshot: order.orderDate,
						contactNameSnapshot: order.contact.name,
						createdById: actor.userId
					},
					select: { id: true }
				})

				for (const orderLine of order.lines) {
					const deliveryLine = await transaction.salesDeliveryLine.create({
						data: {
							deliveryId: delivery.id,
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
								salesDeliveryLineId: deliveryLine.id,
								movementDate: businessDate(parsed.data.deliveryDate),
								quantityDelta: orderLine.quantity.negated(),
								productNameSnapshot: orderLine.productNameSnapshot
							}
						})
					}
				}

				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'sales_delivery.created',
						targetType: 'SalesDelivery',
						targetId: delivery.id,
						requestId: parsed.data.operationKey,
						details: {
							deliveryNumber,
							salesOrderId: order.id,
							salesOrderNumber: order.number
						}
					}
				})

				return loadSalesDeliveryDetail(transaction, actor.businessId, delivery.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function getSalesDelivery(
	actor: Actor,
	input: GetSalesDeliveryInput
): Promise<ActionResult<SalesDeliveryDetail>> {
	const parsed = getSalesDeliveryInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadSalesDeliveryDetail(transaction, actor.businessId, parsed.data.salesDeliveryId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listSalesDeliveries(
	actor: Actor,
	input: SalesDeliveryListInput = {}
): Promise<ActionResult<SalesDeliveryListResult>> {
	const parsed = salesDeliveryListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.SalesDeliveryWhereInput = {
					businessId: actor.businessId,
					...(parsed.data.dateFrom || parsed.data.dateTo
						? {
								deliveryDate: {
									...(parsed.data.dateFrom ? { gte: businessDate(parsed.data.dateFrom) } : {}),
									...(parsed.data.dateTo ? { lte: businessDate(parsed.data.dateTo) } : {})
								}
							}
						: {})
				}
				const totalCount = await transaction.salesDelivery.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const deliveries = await transaction.salesDelivery.findMany({
					where,
					include: { createdBy: { select: { id: true, displayName: true } } },
					orderBy: [{ deliveryDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const rows: SalesDeliverySummary[] = deliveries.map((delivery) => ({
					id: delivery.id,
					deliveryNumber: delivery.number,
					deliveryDate: dateOnly(delivery.deliveryDate),
					sourceOrder: {
						id: delivery.orderId,
						orderNumber: delivery.sourceOrderNumberSnapshot,
						orderDate: dateOnly(delivery.sourceOrderDateSnapshot)
					},
					customer: { id: delivery.contactId, name: delivery.contactNameSnapshot },
					createdBy: delivery.createdBy,
					createdAt: delivery.createdAt.toISOString()
				}))
				return { rows, totalCount, page, pageSize: parsed.data.pageSize, lastPage }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listInventoryMovements(
	actor: Actor,
	input: InventoryMovementListInput = {}
): Promise<ActionResult<InventoryMovementListResult>> {
	const parsed = inventoryMovementListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.InventoryMovementWhereInput = {
					businessId: actor.businessId,
					...(parsed.data.productId ? { productId: parsed.data.productId } : {}),
					...(parsed.data.dateFrom || parsed.data.dateTo
						? {
								movementDate: {
									...(parsed.data.dateFrom ? { gte: businessDate(parsed.data.dateFrom) } : {}),
									...(parsed.data.dateTo ? { lte: businessDate(parsed.data.dateTo) } : {})
								}
							}
						: {})
				}
				const totalCount = await transaction.inventoryMovement.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const movements = await transaction.inventoryMovement.findMany({
					where,
					include: {
						purchaseReceiptLine: {
							include: { receipt: { select: { id: true, number: true } } }
						},
						salesDeliveryLine: {
							include: { delivery: { select: { id: true, number: true } } }
						}
					},
					orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const rows = movements.map((movement) => {
					const receipt = movement.purchaseReceiptLine?.receipt
					const delivery = movement.salesDeliveryLine?.delivery
					if ((receipt ? 1 : 0) + (delivery ? 1 : 0) !== 1) {
						throw new ApplicationError(
							'INVALID_STATE',
							'An inventory movement has an invalid source.'
						)
					}
					return {
						id: movement.id,
						movementDate: dateOnly(movement.movementDate),
						product: { id: movement.productId, name: movement.productNameSnapshot },
						quantityChange: movement.quantityDelta.toFixed(4),
						direction: movement.quantityDelta.isNegative() ? ('OUT' as const) : ('IN' as const),
						sourceType: receipt ? ('PURCHASE_RECEIPT' as const) : ('SALES_DELIVERY' as const),
						sourceId: receipt?.id ?? delivery!.id,
						sourceNumber: receipt?.number ?? delivery!.number
					}
				})
				return { rows, totalCount, page, pageSize: parsed.data.pageSize, lastPage }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
