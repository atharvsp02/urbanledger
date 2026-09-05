import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	createSalesOrderInputSchema,
	getSalesOrderInputSchema,
	salesOrderDetailSchema,
	salesOrderListInputSchema,
	salesOrderTransitionInputSchema,
	updateDraftSalesOrderInputSchema,
	type CreateSalesOrderInput,
	type GetSalesOrderInput,
	type SalesOrderDetail,
	type SalesOrderListInput,
	type SalesOrderListResult,
	type SalesOrderOptions,
	type SalesOrderSummary,
	type SalesOrderTransitionInput,
	type UpdateDraftSalesOrderInput
} from '@/lib/contracts/sales-order'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	assertJournalAmountRange,
	formatJournalAmount,
	sumJournalAmounts,
	type JournalDecimal
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { allocateDocumentNumber } from '@/server/documents/sequences'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type SalesTransaction = Prisma.TransactionClient

type CanonicalLine = {
	productId: string
	quantity: JournalDecimal
	unitPrice: JournalDecimal
	lineNetTotal: JournalDecimal
	taxId: string | null
	analyticAccountId: string | null
}

type CanonicalInput = {
	customerId: string
	orderDate: string
	lines: CanonicalLine[]
}

type TaxDependency = {
	id: string
	name: string
	rate: Prisma.Decimal
	revision: number
	outputAccountId: string
}

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the Sales Order details.',
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
			message: 'The Sales Order request could not be completed.',
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

function canonicalizeInput(input: {
	customerId: string
	orderDate: string
	lines: Array<{
		productId: string
		quantity: string
		unitPrice: string
		taxId?: string | null
		analyticAccountId?: string | null
	}>
}): CanonicalInput {
	return {
		customerId: input.customerId,
		orderDate: input.orderDate,
		lines: input.lines.map((line) => {
			const quantity = new Prisma.Decimal(line.quantity)
			const unitPrice = new Prisma.Decimal(line.unitPrice)
			const lineNetTotal = new Prisma.Decimal(formatJournalAmount(quantity.times(unitPrice)))
			assertJournalAmountRange(lineNetTotal)
			return {
				productId: line.productId,
				quantity,
				unitPrice,
				lineNetTotal,
				taxId: line.taxId ?? null,
				analyticAccountId: line.analyticAccountId ?? null
			}
		})
	}
}

function canonicalPayload(input: CanonicalInput) {
	return {
		customerId: input.customerId,
		orderDate: input.orderDate,
		lines: input.lines.map((line) => ({
			productId: line.productId,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPrice.toFixed(4),
			lineNetTotal: formatJournalAmount(line.lineNetTotal),
			taxId: line.taxId,
			analyticAccountId: line.analyticAccountId
		}))
	}
}

async function loadDependencies(
	transaction: SalesTransaction,
	businessId: string,
	input: CanonicalInput
) {
	const customer = await transaction.contact.findFirst({
		where: { id: input.customerId, businessId }
	})
	if (!customer) throw new ApplicationError('NOT_FOUND', 'The selected customer was not found.')
	if (customer.archivedAt) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose an active customer.')
	}
	if (customer.kind !== 'CUSTOMER' && customer.kind !== 'BOTH') {
		throw new ApplicationError('INVALID_STATE', 'Sales Orders require a Customer or Both contact.')
	}

	const productIds = [...new Set(input.lines.map((line) => line.productId))]
	const products = await transaction.product.findMany({
		where: { id: { in: productIds }, businessId }
	})
	if (products.length !== productIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected product was not found.')
	}
	if (products.some((product) => product.archivedAt)) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose active products.')
	}

	const taxIds = [...new Set(input.lines.flatMap((line) => (line.taxId ? [line.taxId] : [])))]
	const taxes = await transaction.tax.findMany({
		where: { id: { in: taxIds }, businessId },
		include: { outputAccount: true }
	})
	if (taxes.length !== taxIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected sales tax was not found.')
	}
	const taxesById = new Map<string, TaxDependency>()
	for (const tax of taxes) {
		if (tax.archivedAt) {
			throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose an active sales tax.')
		}
		if (tax.scope !== 'SALES' && tax.scope !== 'BOTH') {
			throw new ApplicationError('INVALID_STATE', 'Choose a Sales or Both tax.')
		}
		if (
			!tax.outputAccountId ||
			!tax.outputAccount ||
			tax.outputAccount.businessId !== businessId ||
			tax.outputAccount.archivedAt ||
			tax.outputAccount.type !== 'LIABILITY' ||
			tax.outputAccount.subtype !== 'OUTPUT_TAX'
		) {
			throw new ApplicationError(
				'INVALID_STATE',
				'The sales tax requires an active Output Tax account.'
			)
		}
		taxesById.set(tax.id, {
			id: tax.id,
			name: tax.name,
			rate: tax.rate,
			revision: tax.revision,
			outputAccountId: tax.outputAccountId
		})
	}

	const analyticIds = [
		...new Set(
			input.lines.flatMap((line) => (line.analyticAccountId ? [line.analyticAccountId] : []))
		)
	]
	const analytics = await transaction.analyticAccount.findMany({
		where: { id: { in: analyticIds }, businessId }
	})
	if (analytics.length !== analyticIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected Income analytic account was not found.')
	}
	if (analytics.some((account) => account.archivedAt)) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose active Income analytic accounts.')
	}
	if (analytics.some((account) => account.type !== 'INCOME')) {
		throw new ApplicationError('INVALID_STATE', 'Choose Income analytic accounts.')
	}

	return {
		customer,
		productsById: new Map(products.map((product) => [product.id, product])),
		taxesById
	}
}

function calculatedLines(input: CanonicalInput, taxes: Map<string, TaxDependency>) {
	return input.lines.map((line) => {
		const tax = line.taxId ? taxes.get(line.taxId) : null
		if (line.taxId && !tax)
			throw new ApplicationError('INVALID_STATE', 'A sales tax is unavailable.')
		const taxAmount = tax
			? new Prisma.Decimal(formatJournalAmount(line.lineNetTotal.times(tax.rate).div(100)))
			: new Prisma.Decimal('0')
		assertJournalAmountRange(taxAmount)

		return { ...line, tax: tax ?? null, taxAmount, grossTotal: line.lineNetTotal.plus(taxAmount) }
	})
}

async function loadSalesOrderDetail(
	transaction: SalesTransaction,
	businessId: string,
	salesOrderId: string
): Promise<SalesOrderDetail> {
	const order = await transaction.order.findFirst({
		where: { id: salesOrderId, businessId, kind: 'SALES' },
		include: {
			contact: { select: { id: true, name: true } },
			createdBy: { select: { id: true, displayName: true } },
			lines: {
				include: { analyticAccount: { select: { id: true, name: true } } },
				orderBy: [{ position: 'asc' }, { id: 'asc' }]
			}
		}
	})
	if (!order) throw new ApplicationError('NOT_FOUND', 'This Sales Order does not exist.')

	const delivery = await transaction.salesDelivery.findFirst({
		where: { orderId: order.id, businessId },
		select: { id: true, number: true, deliveryDate: true }
	})
	const customerInvoice = await transaction.financialDocument.findFirst({
		where: {
			sourceOrderId: order.id,
			businessId,
			kind: 'CUSTOMER_INVOICE',
			state: { not: 'CANCELLED' }
		},
		select: { id: true, number: true, state: true }
	})

	return {
		id: order.id,
		kind: 'SALES',
		orderNumber: order.number,
		orderDate: dateOnly(order.orderDate),
		state: order.state,
		netTotal: formatJournalAmount(order.netTotal),
		taxTotal: formatJournalAmount(order.taxTotal),
		total: formatJournalAmount(order.total),
		revision: order.revision,
		customer: order.contact,
		createdBy: order.createdBy,
		createdAt: order.createdAt.toISOString(),
		updatedAt: order.updatedAt.toISOString(),
		delivery:
			delivery == null
				? null
				: {
						id: delivery.id,
						deliveryNumber: delivery.number,
						deliveryDate: dateOnly(delivery.deliveryDate)
					},
		customerInvoice:
			customerInvoice == null
				? null
				: {
						id: customerInvoice.id,
						invoiceNumber: customerInvoice.number,
						state: customerInvoice.state
					},
		lines: order.lines.map((line) => ({
			id: line.id,
			position: line.position,
			productId: line.productId,
			productName: line.productNameSnapshot,
			productKind: line.productKindSnapshot,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPriceSnapshot.toFixed(4),
			lineNetTotal: formatJournalAmount(line.lineTotal),
			tax: line.taxId
				? { id: line.taxId, name: line.taxNameSnapshot!, rate: line.taxRateSnapshot!.toFixed(4) }
				: null,
			taxAmount: formatJournalAmount(line.taxAmount),
			grossTotal: formatJournalAmount(line.grossTotal),
			analyticAccount: line.analyticAccount
		}))
	}
}

async function writeCommercialLines(
	transaction: SalesTransaction,
	orderId: string,
	input: CanonicalInput,
	dependencies: Awaited<ReturnType<typeof loadDependencies>>
) {
	const lines = calculatedLines(input, dependencies.taxesById)
	await transaction.orderLine.createMany({
		data: lines.map((line, position) => {
			const product = dependencies.productsById.get(line.productId)!
			return {
				orderId,
				productId: line.productId,
				productNameSnapshot: product.name,
				productKindSnapshot: product.kind,
				quantity: line.quantity.toFixed(4),
				unitPriceSnapshot: line.unitPrice.toFixed(4),
				lineTotal: formatJournalAmount(line.lineNetTotal),
				taxId: line.tax?.id ?? null,
				taxNameSnapshot: line.tax?.name ?? null,
				taxRateSnapshot: line.tax?.rate ?? null,
				taxRevisionSnapshot: line.tax?.revision ?? null,
				taxAccountIdSnapshot: line.tax?.outputAccountId ?? null,
				taxAmount: formatJournalAmount(line.taxAmount),
				grossTotal: formatJournalAmount(line.grossTotal),
				analyticAccountId: line.analyticAccountId,
				position
			}
		})
	})
	return lines
}

export async function createSalesOrder(
	actor: Actor,
	input: CreateSalesOrderInput
): Promise<ActionResult<SalesOrderDetail>> {
	const parsed = createSalesOrderInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const commercial = canonicalizeInput(parsed.data)
	const operation = 'sales_order.create'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		...canonicalPayload(commercial)
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = salesOrderDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (order) => order.id,
			command: async (transaction) => {
				const dependencies = await loadDependencies(transaction, actor.businessId, commercial)
				const lines = calculatedLines(commercial, dependencies.taxesById)
				const netTotal = sumJournalAmounts(lines.map((line) => line.lineNetTotal))
				const taxTotal = sumJournalAmounts(lines.map((line) => line.taxAmount))
				const total = netTotal.plus(taxTotal)
				assertJournalAmountRange(netTotal)
				assertJournalAmountRange(taxTotal)
				assertJournalAmountRange(total)
				const number = await allocateDocumentNumber(
					transaction,
					actor.businessId,
					'SALES_ORDER',
					commercial.orderDate,
					'SO'
				)
				const order = await transaction.order.create({
					data: {
						businessId: actor.businessId,
						kind: 'SALES',
						contactId: commercial.customerId,
						number,
						orderDate: businessDate(commercial.orderDate),
						netTotal: formatJournalAmount(netTotal),
						taxTotal: formatJournalAmount(taxTotal),
						total: formatJournalAmount(total),
						createdById: actor.userId
					},
					select: { id: true }
				})
				await writeCommercialLines(transaction, order.id, commercial, dependencies)
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'sales_order.created',
						targetType: 'Order',
						targetId: order.id,
						requestId: parsed.data.operationKey,
						details: { orderNumber: number }
					}
				})
				return loadSalesOrderDetail(transaction, actor.businessId, order.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function updateDraftSalesOrder(
	actor: Actor,
	input: UpdateDraftSalesOrderInput
): Promise<ActionResult<SalesOrderDetail>> {
	const parsed = updateDraftSalesOrderInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const commercial = canonicalizeInput(parsed.data)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:create')
				const order = await transaction.order.findFirst({
					where: { id: parsed.data.salesOrderId, businessId: actor.businessId, kind: 'SALES' },
					select: { id: true, state: true, revision: true }
				})
				if (!order) throw new ApplicationError('NOT_FOUND', 'This Sales Order does not exist.')
				if (order.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}
				if (order.state !== 'DRAFT') {
					throw new ApplicationError('INVALID_STATE', 'Only draft Sales Orders can be changed.')
				}
				const dependencies = await loadDependencies(transaction, actor.businessId, commercial)
				const lines = calculatedLines(commercial, dependencies.taxesById)
				const netTotal = sumJournalAmounts(lines.map((line) => line.lineNetTotal))
				const taxTotal = sumJournalAmounts(lines.map((line) => line.taxAmount))
				const total = netTotal.plus(taxTotal)
				const updated = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'SALES',
						state: 'DRAFT',
						revision: parsed.data.expectedRevision
					},
					data: {
						contactId: commercial.customerId,
						orderDate: businessDate(commercial.orderDate),
						netTotal: formatJournalAmount(netTotal),
						taxTotal: formatJournalAmount(taxTotal),
						total: formatJournalAmount(total),
						revision: { increment: 1 }
					}
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}
				await transaction.orderLine.deleteMany({ where: { orderId: order.id } })
				await writeCommercialLines(transaction, order.id, commercial, dependencies)
				return loadSalesOrderDetail(transaction, actor.businessId, order.id)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

async function transitionSalesOrder(
	actor: Actor,
	input: SalesOrderTransitionInput,
	targetState: 'CONFIRMED' | 'CANCELLED'
): Promise<ActionResult<SalesOrderDetail>> {
	const parsed = salesOrderTransitionInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = targetState === 'CONFIRMED' ? 'sales_order.confirm' : 'sales_order.cancel'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		salesOrderId: parsed.data.salesOrderId,
		expectedRevision: parsed.data.expectedRevision
	})

	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:create',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = salesOrderDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (order) => order.id,
			command: async (transaction) => {
				const order = await transaction.order.findFirst({
					where: { id: parsed.data.salesOrderId, businessId: actor.businessId, kind: 'SALES' },
					include: {
						salesDelivery: { select: { id: true } },
						financialDocuments: { select: { id: true } }
					}
				})
				if (!order) throw new ApplicationError('NOT_FOUND', 'This Sales Order does not exist.')
				if (order.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}
				if (
					targetState === 'CANCELLED' &&
					(order.salesDelivery || order.financialDocuments.length > 0)
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'A Sales Order with delivery or invoice history cannot be cancelled.'
					)
				}
				const canTransition =
					targetState === 'CONFIRMED'
						? order.state === 'DRAFT'
						: order.state === 'DRAFT' || order.state === 'CONFIRMED'
				if (!canTransition) {
					throw new ApplicationError(
						'INVALID_STATE',
						`This Sales Order cannot be ${targetState.toLowerCase()}.`
					)
				}
				const updated = await transaction.order.updateMany({
					where: {
						id: order.id,
						businessId: actor.businessId,
						kind: 'SALES',
						state: order.state,
						revision: parsed.data.expectedRevision
					},
					data: { state: targetState, revision: { increment: 1 } }
				})
				if (updated.count === 0) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This Sales Order changed. Reload it and try again.'
					)
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: targetState === 'CONFIRMED' ? 'sales_order.confirmed' : 'sales_order.cancelled',
						targetType: 'Order',
						targetId: order.id,
						requestId: parsed.data.operationKey
					}
				})
				return loadSalesOrderDetail(transaction, actor.businessId, order.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export function confirmSalesOrder(actor: Actor, input: SalesOrderTransitionInput) {
	return transitionSalesOrder(actor, input, 'CONFIRMED')
}

export function cancelSalesOrder(actor: Actor, input: SalesOrderTransitionInput) {
	return transitionSalesOrder(actor, input, 'CANCELLED')
}

export async function getSalesOrder(
	actor: Actor,
	input: GetSalesOrderInput
): Promise<ActionResult<SalesOrderDetail>> {
	const parsed = getSalesOrderInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			return loadSalesOrderDetail(transaction, actor.businessId, parsed.data.salesOrderId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listSalesOrders(
	actor: Actor,
	input: SalesOrderListInput = {}
): Promise<ActionResult<SalesOrderListResult>> {
	const parsed = salesOrderListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const where: Prisma.OrderWhereInput = {
					businessId: actor.businessId,
					kind: 'SALES',
					...(parsed.data.state === 'ALL' ? {} : { state: parsed.data.state })
				}
				const totalCount = await transaction.order.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const orders = await transaction.order.findMany({
					where,
					include: {
						contact: { select: { id: true, name: true } },
						createdBy: { select: { id: true, displayName: true } }
					},
					orderBy: [{ orderDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const rows: SalesOrderSummary[] = orders.map((order) => ({
					id: order.id,
					kind: 'SALES',
					orderNumber: order.number,
					orderDate: dateOnly(order.orderDate),
					state: order.state,
					netTotal: formatJournalAmount(order.netTotal),
					taxTotal: formatJournalAmount(order.taxTotal),
					total: formatJournalAmount(order.total),
					revision: order.revision,
					customer: order.contact,
					createdBy: order.createdBy,
					createdAt: order.createdAt.toISOString(),
					updatedAt: order.updatedAt.toISOString()
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

export async function getSalesOrderOptions(actor: Actor): Promise<ActionResult<SalesOrderOptions>> {
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const [customers, products, taxes, analyticAccounts] = await Promise.all([
					transaction.contact.findMany({
						where: {
							businessId: actor.businessId,
							archivedAt: null,
							kind: { in: ['CUSTOMER', 'BOTH'] }
						},
						select: { id: true, name: true, kind: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					}),
					transaction.product.findMany({
						where: { businessId: actor.businessId, archivedAt: null },
						select: { id: true, name: true, kind: true, salesPrice: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					}),
					transaction.tax.findMany({
						where: {
							businessId: actor.businessId,
							archivedAt: null,
							scope: { in: ['SALES', 'BOTH'] },
							outputAccount: {
								is: {
									businessId: actor.businessId,
									archivedAt: null,
									type: 'LIABILITY',
									subtype: 'OUTPUT_TAX'
								}
							}
						},
						select: { id: true, name: true, rate: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					}),
					transaction.analyticAccount.findMany({
						where: { businessId: actor.businessId, archivedAt: null, type: 'INCOME' },
						select: { id: true, name: true },
						orderBy: [{ name: 'asc' }, { id: 'asc' }]
					})
				])
				return {
					customers: customers.map((customer) => ({
						...customer,
						kind: customer.kind as 'CUSTOMER' | 'BOTH'
					})),
					products: products.map((product) => ({
						...product,
						salesPrice: product.salesPrice.toFixed(4)
					})),
					taxes: taxes.map((tax) => ({ ...tax, rate: tax.rate.toFixed(4) })),
					incomeAnalyticAccounts: analyticAccounts
				} satisfies SalesOrderOptions
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
