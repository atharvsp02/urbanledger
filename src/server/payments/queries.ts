import 'server-only'
import { z } from 'zod'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	getDocumentSettlementInputSchema,
	getPaymentInputSchema,
	getPaymentOptionsInputSchema,
	paymentListInputSchema,
	type DocumentPaymentHistory,
	type DocumentSettlement,
	type GetDocumentSettlementInput,
	type GetPaymentInput,
	type GetPaymentOptionsInput,
	type PaymentDetail,
	type PaymentListInput,
	type PaymentListResult,
	type PaymentOptions,
	type PaymentSummary
} from '@/lib/contracts/payment'
import { Prisma } from '@/generated/prisma/client'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'
import { requireCurrentPaymentActor } from '@/server/payments/authorize'
import { loadPaymentDetail } from '@/server/payments/read-models'
import { calculateDocumentSettlement } from '@/server/payments/settlement'

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the payment filters.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) return { ok: false, error: error.toActionError() }
	return {
		ok: false,
		error: { code: 'DATABASE_UNAVAILABLE', message: 'The payment request could not be completed.' }
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function paymentCapability(actor: Actor) {
	return actor.role === 'CONTACT'
		? ('portal-documents:read' as const)
		: ('transactions:read' as const)
}

function paymentSummary(payment: {
	id: string
	number: string
	direction: 'CUSTOMER_INCOMING' | 'VENDOR_OUTGOING'
	sourceMode: 'STAFF' | 'PORTAL_SIMULATION'
	status: 'POSTED' | 'REVERSED'
	paymentDate: Date
	amount: Prisma.Decimal
	externalReference: string | null
	revision: number
	contactId: string
	contactNameSnapshot: string
	reversalDate: Date | null
	reversalReason: string | null
	createdAt: Date
	journal: { id: string; code: string; name: string }
	journalEntry: { id: string; reference: string }
	reversalEntry: { id: string; reference: string } | null
	createdBy: { id: string; displayName: string }
}): PaymentSummary {
	return {
		id: payment.id,
		paymentNumber: payment.number,
		direction: payment.direction,
		sourceMode: payment.sourceMode,
		status: payment.status,
		paymentDate: dateOnly(payment.paymentDate),
		amount: payment.amount.toFixed(2),
		reference: payment.externalReference,
		revision: payment.revision,
		contact: { id: payment.contactId, name: payment.contactNameSnapshot },
		journal: payment.journal,
		journalEntry: payment.journalEntry,
		reversalEntry: payment.reversalEntry,
		reversalDate: payment.reversalDate ? dateOnly(payment.reversalDate) : null,
		reversalReason: payment.reversalReason,
		createdBy: payment.createdBy,
		createdAt: payment.createdAt.toISOString()
	}
}

export async function getPaymentOptions(
	actor: Actor,
	input: GetPaymentOptionsInput
): Promise<ActionResult<PaymentOptions>> {
	const parsed = getPaymentOptionsInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			const capability = actor.role === 'CONTACT' ? 'portal-payments:create' : 'payments:record'
			const business = await requireCurrentPaymentActor(transaction, actor, capability)
			const document = await calculateDocumentSettlement(transaction, {
				businessId: actor.businessId,
				documentId: parsed.data.documentId,
				timezone: business.timezone,
				...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
			})
			if (actor.role === 'CONTACT' && document.document.kind !== 'CUSTOMER_INVOICE') {
				throw new ApplicationError('FORBIDDEN', 'Portal contacts cannot pay Vendor Bills.')
			}
			const liquidityJournals = await transaction.journal.findMany({
				where: {
					businessId: actor.businessId,
					archivedAt: null,
					type: { in: ['BANK', 'CASH'] },
					defaultLiquidityAccount: {
						businessId: actor.businessId,
						archivedAt: null,
						type: 'ASSET',
						subtype: { in: ['BANK', 'CASH'] }
					}
				},
				select: { id: true, code: true, name: true, type: true },
				orderBy: [{ name: 'asc' }, { id: 'asc' }]
			})

			return { document, liquidityJournals } satisfies PaymentOptions
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getDocumentSettlement(
	actor: Actor,
	input: GetDocumentSettlementInput
): Promise<ActionResult<DocumentSettlement>> {
	const parsed = getDocumentSettlementInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			const business = await requireCurrentPaymentActor(
				transaction,
				actor,
				paymentCapability(actor)
			)
			return calculateDocumentSettlement(transaction, {
				businessId: actor.businessId,
				documentId: parsed.data.documentId,
				asOfDate: parsed.data.asOfDate,
				timezone: business.timezone,
				...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
			})
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getDocumentPaymentHistory(
	actor: Actor,
	input: GetDocumentSettlementInput
): Promise<ActionResult<DocumentPaymentHistory>> {
	const parsed = getDocumentSettlementInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const business = await requireCurrentPaymentActor(
					transaction,
					actor,
					paymentCapability(actor)
				)
				const settlement = await calculateDocumentSettlement(transaction, {
					businessId: actor.businessId,
					documentId: parsed.data.documentId,
					asOfDate: parsed.data.asOfDate,
					timezone: business.timezone,
					...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {})
				})
				const rows = await transaction.payment.findMany({
					where: {
						businessId: actor.businessId,
						...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {}),
						allocations: { some: { documentId: parsed.data.documentId } }
					},
					include: {
						journal: { select: { id: true, code: true, name: true } },
						journalEntry: { select: { id: true, reference: true } },
						reversalEntry: { select: { id: true, reference: true } },
						createdBy: { select: { id: true, displayName: true } }
					},
					orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }]
				})
				return { settlement, payments: rows.map(paymentSummary) }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getPayment(
	actor: Actor,
	input: GetPaymentInput
): Promise<ActionResult<PaymentDetail>> {
	const parsed = getPaymentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentPaymentActor(transaction, actor, paymentCapability(actor))
			return loadPaymentDetail(
				transaction,
				actor.businessId,
				parsed.data.paymentId,
				actor.role === 'CONTACT' ? (actor.contactId ?? undefined) : undefined
			)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function listPayments(
	actor: Actor,
	input: PaymentListInput = {}
): Promise<ActionResult<PaymentListResult>> {
	const parsed = paymentListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentPaymentActor(transaction, actor, paymentCapability(actor))
				const where: Prisma.PaymentWhereInput = {
					businessId: actor.businessId,
					...(actor.role === 'CONTACT' && actor.contactId ? { contactId: actor.contactId } : {}),
					...(parsed.data.direction === 'ALL' ? {} : { direction: parsed.data.direction }),
					...(parsed.data.status === 'ALL' ? {} : { status: parsed.data.status }),
					paymentDate: {
						...(parsed.data.dateFrom ? { gte: new Date(`${parsed.data.dateFrom}T00:00:00Z`) } : {}),
						...(parsed.data.dateTo ? { lte: new Date(`${parsed.data.dateTo}T00:00:00Z`) } : {})
					}
				}
				const totalCount = await transaction.payment.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const rows = await transaction.payment.findMany({
					where,
					include: {
						journal: { select: { id: true, code: true, name: true } },
						journalEntry: { select: { id: true, reference: true } },
						reversalEntry: { select: { id: true, reference: true } },
						createdBy: { select: { id: true, displayName: true } }
					},
					orderBy: [{ paymentDate: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				return {
					rows: rows.map(paymentSummary),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies PaymentListResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
