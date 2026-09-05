import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	contactDocumentSummaryInputSchema,
	portalDocumentInputSchema,
	portalListInputSchema,
	portalPaymentInputSchema,
	type ContactDocumentSummaries,
	type ContactDocumentSummaryInput,
	type InvoicePrintData,
	type PaymentReceiptData,
	type PortalDocumentDetail,
	type PortalDocumentInput,
	type PortalDocumentList,
	type PortalDocumentSummary,
	type PortalListInput,
	type PortalPaymentDetail,
	type PortalPaymentInput,
	type PortalPaymentList,
	type PortalPaymentSummary
} from '@/lib/contracts/portal'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { formatJournalAmount } from '@/server/accounting/money'
import { currentBusinessDate } from '@/server/business/dates'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import { requireCurrentPaymentActor } from '@/server/payments/authorize'
import { calculateDocumentSettlement } from '@/server/payments/settlement'

type PortalTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the document request.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) return { ok: false, error: error.toActionError() }
	return {
		ok: false,
		error: { code: 'DATABASE_UNAVAILABLE', message: 'The document request could not be loaded.' }
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

async function authorizeRead(transaction: PortalTransaction, actor: Actor) {
	if (actor.role === 'CONTACT') {
		return requireCurrentPaymentActor(transaction, actor, 'portal-documents:read')
	}
	return requireCurrentAccountingActor(transaction, actor, 'transactions:read')
}

function requirePortalContact(actor: Actor) {
	if (actor.role !== 'CONTACT' || !actor.contactId) {
		throw new ApplicationError('FORBIDDEN', 'This request is available only to a portal Contact.')
	}
	return actor.contactId
}

async function documentSummary(
	transaction: PortalTransaction,
	actor: Actor,
	timezone: string,
	document: {
		id: string
		kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL'
		number: string
		documentDate: Date
		dueDate: Date
		externalReference: string | null
		contactId: string
		contactNameSnapshot: string
		netTotal: Prisma.Decimal
		taxTotal: Prisma.Decimal
		total: Prisma.Decimal
	},
	asOfDate?: string
): Promise<PortalDocumentSummary> {
	const settlement = await calculateDocumentSettlement(transaction, {
		businessId: actor.businessId,
		documentId: document.id,
		asOfDate,
		timezone,
		...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
	})
	return {
		id: document.id,
		kind: document.kind,
		number: document.number,
		documentDate: dateOnly(document.documentDate),
		dueDate: dateOnly(document.dueDate),
		reference: document.externalReference,
		contact: { id: document.contactId, name: document.contactNameSnapshot },
		netTotal: formatJournalAmount(document.netTotal),
		taxTotal: formatJournalAmount(document.taxTotal),
		total: formatJournalAmount(document.total),
		status: settlement.status,
		paidAmount: settlement.paidAmount,
		outstandingAmount: settlement.outstandingAmount,
		overdueAmount: settlement.overdueAmount
	}
}

async function listPortalDocuments(
	actor: Actor,
	input: PortalListInput,
	kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL'
): Promise<ActionResult<PortalDocumentList>> {
	const parsed = portalListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const contactId = requirePortalContact(actor)
				const business = await authorizeRead(transaction, actor)
				const asOfDate = parsed.data.asOfDate ?? currentBusinessDate(business.timezone)
				const where = {
					businessId: actor.businessId,
					contactId,
					kind,
					state: 'POSTED' as const,
					documentDate: { lte: new Date(`${asOfDate}T00:00:00.000Z`) }
				}
				const totalCount = await transaction.financialDocument.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const documents = await transaction.financialDocument.findMany({
					where,
					orderBy: [{ documentDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				const rows = await Promise.all(
					documents.map((document) =>
						documentSummary(transaction, actor, business.timezone, document, asOfDate)
					)
				)
				return { rows, totalCount, page, pageSize: parsed.data.pageSize, lastPage }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export function listPortalCustomerInvoices(actor: Actor, input: PortalListInput = {}) {
	return listPortalDocuments(actor, input, 'CUSTOMER_INVOICE')
}

export function listPortalVendorBills(actor: Actor, input: PortalListInput = {}) {
	return listPortalDocuments(actor, input, 'VENDOR_BILL')
}

async function loadDocumentDetail(
	transaction: PortalTransaction,
	actor: Actor,
	timezone: string,
	documentId: string,
	kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL',
	asOfDate?: string
): Promise<PortalDocumentDetail> {
	const document = await transaction.financialDocument.findFirst({
		where: {
			id: documentId,
			businessId: actor.businessId,
			kind,
			state: 'POSTED',
			...(asOfDate ? { documentDate: { lte: new Date(`${asOfDate}T00:00:00.000Z`) } } : {}),
			...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
		},
		include: { lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } }
	})
	if (!document) throw new ApplicationError('NOT_FOUND', 'This posted document does not exist.')
	return {
		...(await documentSummary(transaction, actor, timezone, document, asOfDate)),
		sourceOrder: { id: document.sourceOrderId, number: document.sourceOrderNumberSnapshot },
		lines: document.lines.map((line) => ({
			id: line.id,
			productId: line.productId,
			productName: line.productNameSnapshot,
			quantity: line.quantity.toFixed(4),
			unitPrice: line.unitPriceSnapshot.toFixed(4),
			netTotal: formatJournalAmount(line.lineNetTotal),
			taxName: line.taxNameSnapshot,
			taxRate: line.taxRateSnapshot?.toFixed(4) ?? null,
			taxAmount: formatJournalAmount(line.taxAmount),
			total: formatJournalAmount(line.lineTotal)
		}))
	}
}

async function getPortalDocument(
	actor: Actor,
	input: PortalDocumentInput,
	kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL'
): Promise<ActionResult<PortalDocumentDetail>> {
	const parsed = portalDocumentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			requirePortalContact(actor)
			const business = await authorizeRead(transaction, actor)
			return loadDocumentDetail(
				transaction,
				actor,
				business.timezone,
				parsed.data.documentId,
				kind,
				parsed.data.asOfDate
			)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export function getPortalCustomerInvoice(actor: Actor, input: PortalDocumentInput) {
	return getPortalDocument(actor, input, 'CUSTOMER_INVOICE')
}

export function getPortalVendorBill(actor: Actor, input: PortalDocumentInput) {
	return getPortalDocument(actor, input, 'VENDOR_BILL')
}

function paymentSummary(payment: {
	id: string
	number: string
	direction: 'CUSTOMER_INCOMING' | 'VENDOR_OUTGOING'
	status: 'POSTED' | 'REVERSED'
	paymentDate: Date
	amount: Prisma.Decimal
	externalReference: string | null
	contactId: string
	contactNameSnapshot: string
	reversalDate: Date | null
}): PortalPaymentSummary {
	return {
		id: payment.id,
		number: payment.number,
		direction: payment.direction,
		status: payment.status,
		paymentDate: dateOnly(payment.paymentDate),
		amount: formatJournalAmount(payment.amount),
		reference: payment.externalReference,
		contact: { id: payment.contactId, name: payment.contactNameSnapshot },
		reversalDate: payment.reversalDate ? dateOnly(payment.reversalDate) : null
	}
}

async function loadPaymentDetail(
	transaction: PortalTransaction,
	actor: Actor,
	paymentId: string
): Promise<PortalPaymentDetail> {
	const payment = await transaction.payment.findFirst({
		where: {
			id: paymentId,
			businessId: actor.businessId,
			...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
		},
		include: {
			allocations: {
				include: {
					document: { select: { id: true, kind: true, number: true } },
					reversal: true
				},
				orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }]
			}
		}
	})
	if (!payment) throw new ApplicationError('NOT_FOUND', 'This payment does not exist.')
	return {
		...paymentSummary(payment),
		allocations: payment.allocations.map((allocation) => ({
			id: allocation.id,
			document: allocation.document,
			amount: formatJournalAmount(allocation.amount),
			effectiveDate: dateOnly(allocation.effectiveDate),
			reversedAmount: formatJournalAmount(allocation.reversal?.amount ?? new Prisma.Decimal('0')),
			reversalDate: allocation.reversal ? dateOnly(allocation.reversal.effectiveDate) : null
		}))
	}
}

export async function listPortalPayments(
	actor: Actor,
	input: PortalListInput = {}
): Promise<ActionResult<PortalPaymentList>> {
	const parsed = portalListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const contactId = requirePortalContact(actor)
				const business = await authorizeRead(transaction, actor)
				const asOfDate = parsed.data.asOfDate ?? currentBusinessDate(business.timezone)
				const where = {
					businessId: actor.businessId,
					contactId,
					paymentDate: { lte: new Date(`${asOfDate}T00:00:00.000Z`) }
				}
				const totalCount = await transaction.payment.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const payments = await transaction.payment.findMany({
					where,
					orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				return {
					rows: payments.map(paymentSummary),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getPortalPayment(
	actor: Actor,
	input: PortalPaymentInput
): Promise<ActionResult<PortalPaymentDetail>> {
	const parsed = portalPaymentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			requirePortalContact(actor)
			await authorizeRead(transaction, actor)
			return loadPaymentDetail(transaction, actor, parsed.data.paymentId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

function businessPrintHeader(business: {
	name: string
	addressLine1: string | null
	addressLine2: string | null
	city: string | null
	state: string | null
	postalCode: string | null
	country: string
	currency: string
}) {
	return {
		name: business.name,
		addressLines: [
			business.addressLine1,
			business.addressLine2,
			[business.city, business.state, business.postalCode].filter(Boolean).join(', '),
			business.country
		].filter((value): value is string => Boolean(value)),
		currency: business.currency
	}
}

export async function getInvoicePrintData(
	actor: Actor,
	input: PortalDocumentInput
): Promise<ActionResult<InvoicePrintData>> {
	const parsed = portalDocumentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const authorized = await authorizeRead(transaction, actor)
				const business = await transaction.business.findUnique({
					where: { id: actor.businessId }
				})
				if (!business) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')
				const document = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.documentId,
						businessId: actor.businessId,
						state: 'POSTED',
						...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
					},
					select: { kind: true }
				})
				if (!document)
					throw new ApplicationError('NOT_FOUND', 'This posted document does not exist.')
				const detail = await loadDocumentDetail(
					transaction,
					actor,
					authorized.timezone,
					parsed.data.documentId,
					document.kind,
					parsed.data.asOfDate
				)
				return { ...detail, business: businessPrintHeader(business) }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getPaymentReceiptData(
	actor: Actor,
	input: PortalPaymentInput
): Promise<ActionResult<PaymentReceiptData>> {
	const parsed = portalPaymentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await authorizeRead(transaction, actor)
				const business = await transaction.business.findUnique({ where: { id: actor.businessId } })
				if (!business) throw new ApplicationError('NOT_FOUND', 'This business does not exist.')
				return {
					...(await loadPaymentDetail(transaction, actor, parsed.data.paymentId)),
					business: businessPrintHeader(business)
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getContactDocumentSummaries(
	actor: Actor,
	input: ContactDocumentSummaryInput
): Promise<ActionResult<ContactDocumentSummaries>> {
	const parsed = contactDocumentSummaryInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const business = await authorizeRead(transaction, actor)
				const contactId =
					actor.role === 'CONTACT'
						? requirePortalContact(actor)
						: (parsed.data.contactId ?? actor.contactId)
				if (!contactId) {
					throw new ApplicationError('VALIDATION_ERROR', 'Choose a Contact.')
				}
				if (
					actor.role === 'CONTACT' &&
					parsed.data.contactId &&
					parsed.data.contactId !== contactId
				) {
					throw new ApplicationError('FORBIDDEN', 'You cannot view another Contact.')
				}
				const contact = await transaction.contact.findFirst({
					where: { id: contactId, businessId: actor.businessId },
					select: { id: true, name: true }
				})
				if (!contact) throw new ApplicationError('NOT_FOUND', 'This Contact does not exist.')
				const asOfDate = parsed.data.asOfDate ?? currentBusinessDate(business.timezone)
				const asOf = new Date(`${asOfDate}T00:00:00.000Z`)
				const [orders, documents, payments] = await Promise.all([
					transaction.order.findMany({
						where: {
							businessId: actor.businessId,
							contactId,
							orderDate: { lte: asOf },
							...(actor.role === 'CONTACT'
								? { kind: 'SALES' as const, state: { not: 'DRAFT' as const } }
								: {})
						},
						orderBy: [{ orderDate: 'desc' }, { id: 'asc' }]
					}),
					transaction.financialDocument.findMany({
						where: {
							businessId: actor.businessId,
							contactId,
							state: 'POSTED',
							documentDate: { lte: asOf },
							...(actor.role === 'CONTACT' ? { kind: 'CUSTOMER_INVOICE' as const } : {})
						},
						orderBy: [{ documentDate: 'desc' }, { id: 'asc' }]
					}),
					transaction.payment.findMany({
						where: {
							businessId: actor.businessId,
							contactId,
							paymentDate: { lte: asOf },
							...(actor.role === 'CONTACT' ? { direction: 'CUSTOMER_INCOMING' as const } : {})
						},
						orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }]
					})
				])
				return {
					contact,
					orders: orders.map((order) => ({
						id: order.id,
						kind: order.kind,
						number: order.number,
						date: dateOnly(order.orderDate),
						state: order.state,
						total: formatJournalAmount(order.total)
					})),
					documents: await Promise.all(
						documents.map((document) =>
							documentSummary(transaction, actor, business.timezone, document, asOfDate)
						)
					),
					payments: payments.map(paymentSummary)
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
