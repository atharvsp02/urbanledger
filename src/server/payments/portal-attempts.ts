import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	cancelPortalPaymentAttemptInputSchema,
	createPortalPaymentAttemptInputSchema,
	finalizePortalPaymentAttemptInputSchema,
	getPortalPaymentAttemptStatusInputSchema,
	paymentAttemptSchema,
	type CancelPortalPaymentAttemptInput,
	type CreatePortalPaymentAttemptInput,
	type FinalizePortalPaymentAttemptInput,
	type GetPortalPaymentAttemptStatusInput,
	type PaymentAttemptDetail
} from '@/lib/contracts/payment'
import { assertAccountingDateUnlocked } from '@/server/accounting/posting-kernel'
import { formatJournalAmount, parseJournalAmount } from '@/server/accounting/money'
import { assertNotFutureBusinessDate } from '@/server/business/dates'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'
import { requireCurrentPaymentActor } from '@/server/payments/authorize'
import { postPayment } from '@/server/payments/commands'
import { calculateDocumentSettlement } from '@/server/payments/settlement'

type PaymentTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the payment attempt details.',
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
			message: 'The payment attempt could not be completed.',
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

async function loadAttempt(
	transaction: PaymentTransaction,
	businessId: string,
	contactId: string,
	attemptId: string
): Promise<PaymentAttemptDetail> {
	const attempt = await transaction.paymentAttempt.findFirst({
		where: { id: attemptId, businessId, contactId },
		include: {
			document: { select: { id: true, number: true } },
			payment: { select: { id: true } }
		}
	})
	if (!attempt) throw new ApplicationError('NOT_FOUND', 'This payment attempt does not exist.')
	return {
		id: attempt.id,
		document: attempt.document,
		status: attempt.status,
		amount: formatJournalAmount(attempt.amount),
		paymentDate: dateOnly(attempt.paymentDate),
		revision: attempt.revision,
		paymentId: attempt.payment?.id ?? null,
		createdAt: attempt.createdAt.toISOString(),
		updatedAt: attempt.updatedAt.toISOString()
	}
}

function requireContactActor(actor: Actor) {
	if (actor.role !== 'CONTACT' || !actor.contactId) {
		throw new ApplicationError('FORBIDDEN', 'Only a Contact can use the portal payment flow.')
	}
	return actor.contactId
}

export async function createPortalPaymentAttempt(
	actor: Actor,
	input: CreatePortalPaymentAttemptInput
): Promise<ActionResult<PaymentAttemptDetail>> {
	const parsed = createPortalPaymentAttemptInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'portal_payment_attempt.create'
	const amount = formatJournalAmount(parseJournalAmount(parsed.data.amount))
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		documentId: parsed.data.documentId,
		expectedDocumentRevision: parsed.data.expectedDocumentRevision,
		paymentDate: parsed.data.paymentDate,
		amount
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'portal-payments:create',
			authorize: requireCurrentPaymentActor,
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = paymentAttemptSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (attempt) => attempt.id,
			command: async (transaction, accountingLockDate, businessTimezone) => {
				const contactId = requireContactActor(actor)
				const document = await transaction.financialDocument.findFirst({
					where: {
						id: parsed.data.documentId,
						businessId: actor.businessId,
						contactId,
						kind: 'CUSTOMER_INVOICE'
					}
				})
				if (!document) {
					throw new ApplicationError('NOT_FOUND', 'This Customer Invoice does not exist.')
				}
				if (document.revision !== parsed.data.expectedDocumentRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This invoice changed. Reload it and try again.'
					)
				}
				if (document.state !== 'POSTED') {
					throw new ApplicationError('INVALID_STATE', 'Only a posted Customer Invoice can be paid.')
				}
				if (parsed.data.paymentDate < dateOnly(document.documentDate)) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'The payment date cannot be before the invoice date.'
					)
				}
				assertAccountingDateUnlocked(parsed.data.paymentDate, accountingLockDate)
				assertNotFutureBusinessDate(parsed.data.paymentDate, businessTimezone, 'Payment date')
				const settlement = await calculateDocumentSettlement(transaction, {
					businessId: actor.businessId,
					documentId: document.id,
					asOfDate: parsed.data.paymentDate,
					timezone: businessTimezone,
					contactId
				})
				if (new Prisma.Decimal(amount).greaterThan(settlement.outstandingAmount)) {
					throw new ApplicationError(
						'INSUFFICIENT_OUTSTANDING',
						'The payment amount exceeds the invoice outstanding amount.'
					)
				}
				const attempt = await transaction.paymentAttempt.create({
					data: {
						businessId: actor.businessId,
						documentId: document.id,
						contactId,
						direction: 'CUSTOMER_INCOMING',
						sourceMode: 'PORTAL_SIMULATION',
						amount,
						paymentDate: businessDate(parsed.data.paymentDate),
						expectedDocumentRevision: parsed.data.expectedDocumentRevision,
						createdById: actor.userId
					},
					select: { id: true }
				})
				return loadAttempt(transaction, actor.businessId, contactId, attempt.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function finalizePortalPaymentAttempt(
	actor: Actor,
	input: FinalizePortalPaymentAttemptInput
): Promise<ActionResult<PaymentAttemptDetail>> {
	const parsed = finalizePortalPaymentAttemptInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'portal_payment_attempt.finalize'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		attemptId: parsed.data.attemptId,
		expectedRevision: parsed.data.expectedRevision,
		journalId: parsed.data.journalId ?? null,
		outcome: parsed.data.outcome
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'portal-payments:create',
			authorize: requireCurrentPaymentActor,
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = paymentAttemptSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (attempt) => attempt.id,
			command: async (transaction, accountingLockDate, businessTimezone) => {
				const contactId = requireContactActor(actor)
				const attempt = await transaction.paymentAttempt.findFirst({
					where: { id: parsed.data.attemptId, businessId: actor.businessId, contactId }
				})
				if (!attempt)
					throw new ApplicationError('NOT_FOUND', 'This payment attempt does not exist.')
				if (attempt.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This payment attempt changed. Reload it and try again.'
					)
				}
				if (attempt.status !== 'PENDING') {
					throw new ApplicationError('INVALID_STATE', 'Only a pending payment attempt can finish.')
				}

				if (parsed.data.outcome === 'FAILED') {
					await transaction.paymentAttempt.update({
						where: { id: attempt.id },
						data: { status: 'FAILED', failureCode: 'SIMULATED_DECLINE', revision: { increment: 1 } }
					})
				} else {
					await postPayment(transaction, {
						actor,
						direction: 'CUSTOMER_INCOMING',
						documentId: attempt.documentId,
						expectedDocumentRevision: attempt.expectedDocumentRevision,
						journalId: parsed.data.journalId!,
						paymentDate: dateOnly(attempt.paymentDate),
						amount: formatJournalAmount(attempt.amount),
						reference: null,
						sourceMode: 'PORTAL_SIMULATION',
						paymentAttemptId: attempt.id,
						operationKey: parsed.data.operationKey,
						accountingLockDate,
						businessTimezone
					})
					await transaction.paymentAttempt.update({
						where: { id: attempt.id },
						data: { status: 'SUCCEEDED', revision: { increment: 1 } }
					})
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: `portal_payment_attempt.${parsed.data.outcome.toLowerCase()}`,
						targetType: 'PaymentAttempt',
						targetId: attempt.id,
						requestId: parsed.data.operationKey
					}
				})
				return loadAttempt(transaction, actor.businessId, contactId, attempt.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function cancelPortalPaymentAttempt(
	actor: Actor,
	input: CancelPortalPaymentAttemptInput
): Promise<ActionResult<PaymentAttemptDetail>> {
	const parsed = cancelPortalPaymentAttemptInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'portal_payment_attempt.cancel'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		attemptId: parsed.data.attemptId,
		expectedRevision: parsed.data.expectedRevision
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'portal-payments:create',
			authorize: requireCurrentPaymentActor,
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = paymentAttemptSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (attempt) => attempt.id,
			command: async (transaction) => {
				const contactId = requireContactActor(actor)
				const updated = await transaction.paymentAttempt.updateMany({
					where: {
						id: parsed.data.attemptId,
						businessId: actor.businessId,
						contactId,
						status: 'PENDING',
						revision: parsed.data.expectedRevision
					},
					data: { status: 'CANCELLED', revision: { increment: 1 } }
				})
				if (updated.count === 0) {
					const attempt = await transaction.paymentAttempt.findFirst({
						where: { id: parsed.data.attemptId, businessId: actor.businessId, contactId }
					})
					if (!attempt) {
						throw new ApplicationError('NOT_FOUND', 'This payment attempt does not exist.')
					}
					throw new ApplicationError(
						attempt.revision !== parsed.data.expectedRevision ? 'STALE_REVISION' : 'INVALID_STATE',
						'This payment attempt can no longer be cancelled.'
					)
				}
				return loadAttempt(transaction, actor.businessId, contactId, parsed.data.attemptId)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function getPortalPaymentAttemptStatus(
	actor: Actor,
	input: GetPortalPaymentAttemptStatusInput
): Promise<ActionResult<PaymentAttemptDetail>> {
	const parsed = getPortalPaymentAttemptStatusInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentPaymentActor(transaction, actor, 'portal-payments:create')
			const contactId = requireContactActor(actor)
			return loadAttempt(transaction, actor.businessId, contactId, parsed.data.attemptId)
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
