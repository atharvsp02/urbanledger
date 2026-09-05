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
	type PurchaseOrderOptions,
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
	lineNetTotal: JournalDecimal
	taxId: string | null
	analyticAccountId: string | null
}

type CanonicalCommercialInput = {
	vendorId: string
	orderDate: string
	lines: CanonicalLine[]
}

type TaxDependency = {
	id: string
	name: string
	rate: Prisma.Decimal
	revision: number
	inputAccountId: string
}

type PurchaseDependencies = {
	products: Map<
		string,
		{ id: string; name: string; kind: 'GOODS' | 'SERVICE' | 'COMBO'; archivedAt: Date | null }
	>
	taxes: Map<string, TaxDependency>
	analytics: Map<string, { id: string; name: string }>
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
	lines: Array<{
		productId: string
		quantity: string
		unitPrice: string
		taxId?: string | null
		analyticAccountId?: string | null
	}>
}): CanonicalCommercialInput {
	const lines = input.lines.map((line) => {
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

	return { vendorId: input.vendorId, orderDate: input.orderDate, lines }
}

function canonicalCommercialPayload(input: CanonicalCommercialInput) {
	return {
		vendorId: input.vendorId,
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
		select: { id: true, name: true, kind: true, archivedAt: true }
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
		include: { inputAccount: true }
	})
	if (taxes.length !== taxIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected purchase tax was not found.')
	}
	const taxMap = new Map<string, TaxDependency>()
	for (const tax of taxes) {
		if (tax.archivedAt) {
			throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose an active purchase tax.')
		}
		if (tax.scope !== 'PURCHASE' && tax.scope !== 'BOTH') {
			throw new ApplicationError('INVALID_STATE', 'Choose a Purchase or Both tax.')
		}
		if (
			!tax.inputAccountId ||
			!tax.inputAccount ||
			tax.inputAccount.businessId !== businessId ||
			tax.inputAccount.archivedAt ||
			tax.inputAccount.type !== 'ASSET' ||
			tax.inputAccount.subtype !== 'INPUT_TAX'
		) {
			throw new ApplicationError(
				'INVALID_STATE',
				'The purchase tax requires an active Input Tax account.'
			)
		}
		taxMap.set(tax.id, {
			id: tax.id,
			name: tax.name,
			rate: tax.rate,
			revision: tax.revision,
			inputAccountId: tax.inputAccountId
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
		throw new ApplicationError('NOT_FOUND', 'A selected expense analytic account was not found.')
	}
	if (analytics.some((account) => account.archivedAt)) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose active expense analytic accounts.')
	}
	if (analytics.some((account) => account.type !== 'EXPENSE')) {
		throw new ApplicationError('INVALID_STATE', 'Choose Expense analytic accounts.')
	}

	return {
		products: new Map(products.map((product) => [product.id, product])),
		taxes: taxMap,
		analytics: new Map(analytics.map((account) => [account.id, account]))
	} satisfies PurchaseDependencies
}

function calculateCanonicalTotals(
	input: CanonicalCommercialInput,
	dependencies: PurchaseDependencies
) {
	const lines = input.lines.map((line) => {
		const tax = line.taxId ? dependencies.taxes.get(line.taxId) : null
		const taxAmount = tax
			? new Prisma.Decimal(formatJournalAmount(line.lineNetTotal.times(tax.rate).div(100)))
			: new Prisma.Decimal('0.00')
		const grossTotal = line.lineNetTotal.plus(taxAmount)
		assertJournalAmountRange(taxAmount)
		assertJournalAmountRange(grossTotal)
		return { ...line, tax, taxAmount, grossTotal }
	})
	const netTotal = sumJournalAmounts(lines.map((line) => line.lineNetTotal))
	const taxTotal = sumJournalAmounts(lines.map((line) => line.taxAmount))
	const total = sumJournalAmounts(lines.map((line) => line.grossTotal))
	assertJournalAmountRange(netTotal)
	assertJournalAmountRange(taxTotal)
	assertJournalAmountRange(total)
	return { lines, netTotal, taxTotal, total }
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
		include: { analyticAccount: { select: { id: true, name: true } } },
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
		netTotal: formatJournalAmount(order.netTotal),
		taxTotal: formatJournalAmount(order.taxTotal),
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
			productKind: line.productKindSnapshot,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPriceSnapshot.toFixed(4),
			lineNetTotal: formatJournalAmount(line.lineTotal),
			tax:
				line.taxId && line.taxNameSnapshot && line.taxRateSnapshot
					? {
							id: line.taxId,
							name: line.taxNameSnapshot,
							rate: line.taxRateSnapshot.toFixed(4)
						}
					: null,
			taxAmount: formatJournalAmount(line.taxAmount),
			analyticAccount: line.analyticAccount,
			lineTotal: formatJournalAmount(line.grossTotal)
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
			netTotal: formatJournalAmount(order.netTotal),
			taxTotal: formatJournalAmount(order.taxTotal),
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
						if (storedResult.success) return storedResult.data
						if (existing.resourceId) {
							return loadPurchaseOrderDetail(transaction, actor.businessId, existing.resourceId)
						}
						throw new ApplicationError(
							'INVALID_STATE',
							'The stored purchase order result is invalid.'
						)
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
					include: { lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }
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

				if (targetState === 'CONFIRMED') {
					const dependencies = await requirePurchaseDependencies(transaction, actor.businessId, {
						vendorId: order.contactId,
						orderDate: dateOnly(order.orderDate),
						lines: order.lines.map((line) => ({
							productId: line.productId,
							quantity: line.quantity,
							unitPrice: line.unitPriceSnapshot,
							lineNetTotal: line.lineTotal,
							taxId: line.taxId,
							analyticAccountId: line.analyticAccountId
						}))
					})
					for (const line of order.lines) {
						const tax = line.taxId ? dependencies.taxes.get(line.taxId) : null
						if (
							line.taxId &&
							(!tax ||
								line.taxNameSnapshot !== tax.name ||
								line.taxRevisionSnapshot !== tax.revision ||
								!line.taxRateSnapshot?.equals(tax.rate) ||
								line.taxAccountIdSnapshot !== tax.inputAccountId)
						) {
							throw new ApplicationError(
								'STALE_REVISION',
								'A purchase tax changed. Update the draft Purchase Order before confirming.'
							)
						}
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

export async function getPurchaseOrderOptions(
	actor: Actor
): Promise<ActionResult<PurchaseOrderOptions>> {
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			const [vendors, products, taxes, expenseAnalyticAccounts] = await Promise.all([
				transaction.contact.findMany({
					where: {
						businessId: actor.businessId,
						archivedAt: null,
						kind: { in: ['VENDOR', 'BOTH'] }
					},
					select: { id: true, name: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				}),
				transaction.product.findMany({
					where: { businessId: actor.businessId, archivedAt: null },
					select: { id: true, name: true, kind: true, purchaseCost: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				}),
				transaction.tax.findMany({
					where: {
						businessId: actor.businessId,
						archivedAt: null,
						scope: { in: ['PURCHASE', 'BOTH'] },
						inputAccount: {
							businessId: actor.businessId,
							archivedAt: null,
							type: 'ASSET',
							subtype: 'INPUT_TAX'
						}
					},
					select: { id: true, name: true, rate: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				}),
				transaction.analyticAccount.findMany({
					where: { businessId: actor.businessId, archivedAt: null, type: 'EXPENSE' },
					select: { id: true, name: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				})
			])

			return {
				vendors,
				products: products.map((product) => ({
					id: product.id,
					name: product.name,
					kind: product.kind,
					purchaseCost: product.purchaseCost.toFixed(4)
				})),
				taxes: taxes.map((tax) => ({
					id: tax.id,
					name: tax.name,
					rate: tax.rate.toFixed(4)
				})),
				expenseAnalyticAccounts
			} satisfies PurchaseOrderOptions
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
				const dependencies = await requirePurchaseDependencies(
					transaction,
					actor.businessId,
					commercial
				)
				const canonical = calculateCanonicalTotals(commercial, dependencies)
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
						netTotal: formatJournalAmount(canonical.netTotal),
						taxTotal: formatJournalAmount(canonical.taxTotal),
						total: formatJournalAmount(canonical.total),
						createdById: actor.userId
					},
					select: { id: true }
				})

				await transaction.orderLine.createMany({
					data: canonical.lines.map((line, index) => {
						const product = dependencies.products.get(line.productId)

						if (!product) {
							throw new ApplicationError('INVALID_STATE', 'A selected product is unavailable.')
						}

						return {
							orderId: order.id,
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
							taxAccountIdSnapshot: line.tax?.inputAccountId ?? null,
							taxAmount: formatJournalAmount(line.taxAmount),
							grossTotal: formatJournalAmount(line.grossTotal),
							analyticAccountId: line.analyticAccountId,
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
				const dependencies = await requirePurchaseDependencies(
					transaction,
					actor.businessId,
					commercial
				)
				const canonical = calculateCanonicalTotals(commercial, dependencies)
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
						netTotal: formatJournalAmount(canonical.netTotal),
						taxTotal: formatJournalAmount(canonical.taxTotal),
						total: formatJournalAmount(canonical.total),
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
					data: canonical.lines.map((line, index) => {
						const product = dependencies.products.get(line.productId)

						if (!product) {
							throw new ApplicationError('INVALID_STATE', 'A selected product is unavailable.')
						}

						return {
							orderId: parsed.data.purchaseOrderId,
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
							taxAccountIdSnapshot: line.tax?.inputAccountId ?? null,
							taxAmount: formatJournalAmount(line.taxAmount),
							grossTotal: formatJournalAmount(line.grossTotal),
							analyticAccountId: line.analyticAccountId,
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
