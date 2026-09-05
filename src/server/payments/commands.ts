import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	financialDocumentReversalResultSchema,
	paymentDetailSchema,
	recordCustomerPaymentInputSchema,
	recordVendorPaymentInputSchema,
	reverseFinancialDocumentInputSchema,
	reversePaymentInputSchema,
	type FinancialDocumentReversalResult,
	type RecordCustomerPaymentInput,
	type RecordVendorPaymentInput,
	type ReverseFinancialDocumentInput,
	type ReversePaymentInput,
	type PaymentDetail
} from '@/lib/contracts/payment'
import {
	allocateJournalEntryNumber,
	assertAccountingDateUnlocked,
	commitPostedJournalEntry,
	type PostedJournalLine
} from '@/server/accounting/posting-kernel'
import {
	formatJournalAmount,
	parseJournalAmount,
	zeroJournalAmount
} from '@/server/accounting/money'
import { assertNotFutureBusinessDate } from '@/server/business/dates'
import { allocateDocumentNumber } from '@/server/documents/sequences'
import { ApplicationError } from '@/server/errors/application-error'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'
import { loadPaymentDetail } from '@/server/payments/read-models'
import { calculateDocumentSettlement } from '@/server/payments/settlement'

type PaymentTransaction = Prisma.TransactionClient
type PaymentDirection = 'CUSTOMER_INCOMING' | 'VENDOR_OUTGOING'
type FinancialDocumentKind = 'CUSTOMER_INVOICE' | 'VENDOR_BILL'

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the payment details.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown, requestId: string): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError(requestId) }
	}
	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'The payment request could not be completed.',
			requestId
		}
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function businessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

async function lockFinancialDocument(transaction: PaymentTransaction, documentId: string) {
	const rows = await transaction.$queryRaw<Array<{ id: string }>>(
		Prisma.sql`SELECT id FROM app.financial_documents WHERE id = ${documentId}::uuid FOR UPDATE`
	)
	if (rows.length === 0)
		throw new ApplicationError('NOT_FOUND', 'This financial document does not exist.')
}

async function lockPayment(transaction: PaymentTransaction, paymentId: string) {
	const rows = await transaction.$queryRaw<Array<{ id: string }>>(
		Prisma.sql`SELECT id FROM app.payments WHERE id = ${paymentId}::uuid FOR UPDATE`
	)
	if (rows.length === 0) throw new ApplicationError('NOT_FOUND', 'This payment does not exist.')
}

async function postPayment(
	transaction: PaymentTransaction,
	input: {
		actor: Actor
		direction: PaymentDirection
		documentId: string
		expectedDocumentRevision: number
		journalId: string
		paymentDate: string
		amount: string
		reference: string | null
		sourceMode: 'STAFF' | 'PORTAL_SIMULATION'
		paymentAttemptId?: string
		operationKey: string
		accountingLockDate: Date | null
		businessTimezone: string
	}
) {
	await lockFinancialDocument(transaction, input.documentId)
	const expectedKind: FinancialDocumentKind =
		input.direction === 'CUSTOMER_INCOMING' ? 'CUSTOMER_INVOICE' : 'VENDOR_BILL'
	const document = await transaction.financialDocument.findFirst({
		where: { id: input.documentId, businessId: input.actor.businessId, kind: expectedKind },
		include: {
			contact: { select: { id: true, businessId: true, kind: true, name: true } },
			journalEntry: {
				include: { items: { include: { account: true } } }
			}
		}
	})
	if (!document) throw new ApplicationError('NOT_FOUND', 'This posted document does not exist.')
	if (document.revision !== input.expectedDocumentRevision) {
		throw new ApplicationError(
			'STALE_REVISION',
			'This document changed. Reload its settlement and try again.'
		)
	}
	if (document.state !== 'POSTED' || !document.journalEntry || document.reversalEntryId) {
		throw new ApplicationError('INVALID_STATE', 'Only posted financial documents can be paid.')
	}
	if (document.contact.businessId !== input.actor.businessId) {
		throw new ApplicationError('INVALID_STATE', 'The document contact is outside this business.')
	}
	if (input.actor.role === 'CONTACT' && input.actor.contactId !== document.contactId) {
		throw new ApplicationError('FORBIDDEN', 'You can pay only your own Customer Invoices.')
	}
	if (
		(input.direction === 'CUSTOMER_INCOMING' &&
			document.contact.kind !== 'CUSTOMER' &&
			document.contact.kind !== 'BOTH') ||
		(input.direction === 'VENDOR_OUTGOING' &&
			document.contact.kind !== 'VENDOR' &&
			document.contact.kind !== 'BOTH')
	) {
		throw new ApplicationError(
			'INVALID_STATE',
			'The document contact is not valid for this payment.'
		)
	}
	if (input.paymentDate < dateOnly(document.documentDate)) {
		throw new ApplicationError(
			'VALIDATION_ERROR',
			'The payment date cannot be before the document date.'
		)
	}
	assertAccountingDateUnlocked(input.paymentDate, input.accountingLockDate)
	assertNotFutureBusinessDate(input.paymentDate, input.businessTimezone, 'Payment date')

	const amount = parseJournalAmount(input.amount)
	const settlement = await calculateDocumentSettlement(transaction, {
		businessId: input.actor.businessId,
		documentId: document.id,
		asOfDate: input.paymentDate,
		timezone: input.businessTimezone
	})
	const outstanding = new Prisma.Decimal(settlement.outstandingAmount)
	if (amount.greaterThan(outstanding)) {
		throw new ApplicationError(
			'INSUFFICIENT_OUTSTANDING',
			'The payment amount exceeds the document outstanding amount.'
		)
	}

	const journal = await transaction.journal.findFirst({
		where: { id: input.journalId, businessId: input.actor.businessId },
		include: { defaultLiquidityAccount: true }
	})
	if (!journal || journal.archivedAt || (journal.type !== 'BANK' && journal.type !== 'CASH')) {
		throw new ApplicationError('INVALID_STATE', 'Choose an active Bank or Cash journal.')
	}
	const liquidityAccount = journal.defaultLiquidityAccount
	if (
		!liquidityAccount ||
		liquidityAccount.businessId !== input.actor.businessId ||
		liquidityAccount.archivedAt ||
		liquidityAccount.type !== 'ASSET' ||
		(journal.type === 'BANK'
			? liquidityAccount.subtype !== 'BANK'
			: liquidityAccount.subtype !== 'CASH')
	) {
		throw new ApplicationError(
			'INVALID_STATE',
			'The payment journal requires a compatible active liquidity account.'
		)
	}

	const controlSubtype = input.direction === 'CUSTOMER_INCOMING' ? 'RECEIVABLE' : 'PAYABLE'
	const controlItem = document.journalEntry.items.find(
		(item) =>
			item.contactId === document.contactId &&
			item.account.businessId === input.actor.businessId &&
			item.account.subtype === controlSubtype &&
			(input.direction === 'CUSTOMER_INCOMING'
				? item.debit.greaterThan(0)
				: item.credit.greaterThan(0))
	)
	if (!controlItem) {
		throw new ApplicationError(
			'INVALID_STATE',
			'The document posting does not contain the required control-account line.'
		)
	}

	const paymentId = randomUUID()
	const sequenceKind =
		input.direction === 'CUSTOMER_INCOMING' ? 'CUSTOMER_PAYMENT' : 'VENDOR_PAYMENT'
	const number = await allocateDocumentNumber(
		transaction,
		input.actor.businessId,
		sequenceKind,
		input.paymentDate,
		input.direction === 'CUSTOMER_INCOMING' ? 'RCPT' : 'PAY'
	)
	const entryNumber = await allocateJournalEntryNumber(
		transaction,
		input.actor.businessId,
		input.paymentDate
	)
	const liquidityLine: PostedJournalLine = {
		accountId: liquidityAccount.id,
		contactId: document.contactId,
		analyticAccountId: null,
		description: number,
		debit: input.direction === 'CUSTOMER_INCOMING' ? amount : zeroJournalAmount(),
		credit: input.direction === 'VENDOR_OUTGOING' ? amount : zeroJournalAmount()
	}
	const controlLine: PostedJournalLine = {
		accountId: controlItem.accountId,
		contactId: document.contactId,
		analyticAccountId: null,
		description: document.number,
		debit: input.direction === 'VENDOR_OUTGOING' ? amount : zeroJournalAmount(),
		credit: input.direction === 'CUSTOMER_INCOMING' ? amount : zeroJournalAmount()
	}
	const entry = await commitPostedJournalEntry(transaction, {
		businessId: input.actor.businessId,
		journalId: journal.id,
		postingDate: businessDate(input.paymentDate),
		reference: entryNumber,
		source: input.direction === 'CUSTOMER_INCOMING' ? 'CUSTOMER_PAYMENT' : 'VENDOR_PAYMENT',
		sourceReference: paymentId,
		createdById: input.actor.userId,
		lines: [liquidityLine, controlLine]
	})
	await transaction.payment.create({
		data: {
			id: paymentId,
			businessId: input.actor.businessId,
			contactId: document.contactId,
			journalId: journal.id,
			paymentAttemptId: input.paymentAttemptId ?? null,
			direction: input.direction,
			sourceMode: input.sourceMode,
			number,
			paymentDate: businessDate(input.paymentDate),
			amount: formatJournalAmount(amount),
			contactNameSnapshot: document.contact.name,
			externalReference: input.reference,
			journalEntryId: entry.entryId,
			createdById: input.actor.userId
		}
	})
	await transaction.paymentAllocation.create({
		data: {
			paymentId,
			documentId: document.id,
			amount: formatJournalAmount(amount),
			effectiveDate: businessDate(input.paymentDate)
		}
	})
	await transaction.auditEvent.create({
		data: {
			businessId: input.actor.businessId,
			actorUserId: input.actor.userId,
			action:
				input.direction === 'CUSTOMER_INCOMING'
					? 'customer_payment.recorded'
					: 'vendor_payment.recorded',
			targetType: 'Payment',
			targetId: paymentId,
			requestId: input.operationKey,
			details: {
				paymentNumber: number,
				documentId: document.id,
				documentNumber: document.number,
				amount: formatJournalAmount(amount),
				entryId: entry.entryId
			}
		}
	})

	return loadPaymentDetail(transaction, input.actor.businessId, paymentId)
}

async function recordPayment(
	actor: Actor,
	input: RecordCustomerPaymentInput | RecordVendorPaymentInput,
	direction: PaymentDirection
): Promise<ActionResult<PaymentDetail>> {
	const schema =
		direction === 'CUSTOMER_INCOMING'
			? recordCustomerPaymentInputSchema
			: recordVendorPaymentInputSchema
	const parsed = schema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation =
		direction === 'CUSTOMER_INCOMING' ? 'customer_payment.record' : 'vendor_payment.record'
	const amount = formatJournalAmount(parseJournalAmount(parsed.data.amount))
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		documentId: parsed.data.documentId,
		expectedDocumentRevision: parsed.data.expectedDocumentRevision,
		journalId: parsed.data.journalId,
		paymentDate: parsed.data.paymentDate,
		amount,
		reference: parsed.data.reference ?? null
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'payments:record',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = paymentDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (payment) => payment.id,
			command: (transaction, accountingLockDate, businessTimezone) =>
				postPayment(transaction, {
					actor,
					direction,
					documentId: parsed.data.documentId,
					expectedDocumentRevision: parsed.data.expectedDocumentRevision,
					journalId: parsed.data.journalId,
					paymentDate: parsed.data.paymentDate,
					amount,
					reference: parsed.data.reference ?? null,
					sourceMode: 'STAFF',
					operationKey: parsed.data.operationKey,
					accountingLockDate,
					businessTimezone
				})
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export function recordCustomerPayment(actor: Actor, input: RecordCustomerPaymentInput) {
	return recordPayment(actor, input, 'CUSTOMER_INCOMING')
}

export function recordVendorPayment(actor: Actor, input: RecordVendorPaymentInput) {
	return recordPayment(actor, input, 'VENDOR_OUTGOING')
}

export async function reversePayment(
	actor: Actor,
	input: ReversePaymentInput
): Promise<ActionResult<PaymentDetail>> {
	const parsed = reversePaymentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = 'payment.reverse'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		paymentId: parsed.data.paymentId,
		expectedRevision: parsed.data.expectedRevision,
		reversalDate: parsed.data.reversalDate,
		reason: parsed.data.reason
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:reverse',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = paymentDetailSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (payment) => payment.id,
			command: async (transaction, accountingLockDate, businessTimezone) => {
				await lockPayment(transaction, parsed.data.paymentId)
				const payment = await transaction.payment.findFirst({
					where: { id: parsed.data.paymentId, businessId: actor.businessId },
					include: {
						journalEntry: { include: { items: true } },
						allocations: { include: { reversal: true } }
					}
				})
				if (!payment) throw new ApplicationError('NOT_FOUND', 'This payment does not exist.')
				if (payment.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This payment changed. Reload it and try again.'
					)
				}
				if (payment.status !== 'POSTED') {
					throw new ApplicationError('INVALID_STATE', 'Only a posted payment can be reversed.')
				}
				if (payment.allocations.length !== 1 || payment.allocations[0]?.reversal) {
					throw new ApplicationError('INVALID_STATE', 'The payment allocation cannot be reversed.')
				}
				if (parsed.data.reversalDate < dateOnly(payment.paymentDate)) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'The reversal date cannot be before the payment date.'
					)
				}
				assertAccountingDateUnlocked(parsed.data.reversalDate, accountingLockDate)
				assertNotFutureBusinessDate(
					parsed.data.reversalDate,
					businessTimezone,
					'Payment reversal date'
				)
				const entryNumber = await allocateJournalEntryNumber(
					transaction,
					actor.businessId,
					parsed.data.reversalDate
				)
				const reversal = await commitPostedJournalEntry(transaction, {
					businessId: actor.businessId,
					journalId: payment.journalEntry.journalId,
					postingDate: businessDate(parsed.data.reversalDate),
					reference: entryNumber,
					source: 'REVERSAL',
					sourceReference: payment.id,
					reversalOfEntryId: payment.journalEntryId,
					createdById: actor.userId,
					lines: payment.journalEntry.items.map((item) => ({
						accountId: item.accountId,
						contactId: item.contactId,
						analyticAccountId: item.analyticAccountId,
						description: item.description,
						debit: item.credit,
						credit: item.debit
					}))
				})
				const allocation = payment.allocations[0]!
				await transaction.allocationReversal.create({
					data: {
						allocationId: allocation.id,
						amount: allocation.amount,
						effectiveDate: businessDate(parsed.data.reversalDate),
						createdById: actor.userId
					}
				})
				await transaction.payment.update({
					where: { id: payment.id },
					data: {
						status: 'REVERSED',
						reversalEntryId: reversal.entryId,
						reversalDate: businessDate(parsed.data.reversalDate),
						reversalReason: parsed.data.reason,
						reversedById: actor.userId,
						revision: { increment: 1 }
					}
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'payment.reversed',
						targetType: 'Payment',
						targetId: payment.id,
						requestId: parsed.data.operationKey,
						details: { reason: parsed.data.reason, reversalEntryId: reversal.entryId }
					}
				})
				return loadPaymentDetail(transaction, actor.businessId, payment.id)
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

async function reverseFinancialDocument(
	actor: Actor,
	input: ReverseFinancialDocumentInput,
	kind: FinancialDocumentKind
): Promise<ActionResult<FinancialDocumentReversalResult>> {
	const parsed = reverseFinancialDocumentInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const operation = kind === 'CUSTOMER_INVOICE' ? 'customer_invoice.reverse' : 'vendor_bill.reverse'
	const hash = canonicalRequestHash({
		operation,
		actorUserId: actor.userId,
		documentId: parsed.data.documentId,
		expectedRevision: parsed.data.expectedRevision,
		reversalDate: parsed.data.reversalDate,
		reason: parsed.data.reason
	})
	try {
		const result = await executeIdempotentOperation({
			actor,
			capability: 'transactions:reverse',
			operationKey: parsed.data.operationKey,
			operation,
			requestHash: hash,
			parseStoredResult: (value) => {
				const stored = financialDocumentReversalResultSchema.safeParse(value)
				return stored.success ? stored.data : null
			},
			resourceId: (document) => document.documentId,
			command: async (transaction, accountingLockDate, businessTimezone) => {
				await lockFinancialDocument(transaction, parsed.data.documentId)
				const document = await transaction.financialDocument.findFirst({
					where: { id: parsed.data.documentId, businessId: actor.businessId, kind },
					include: {
						journalEntry: { include: { items: true } },
						allocations: { include: { reversal: true } }
					}
				})
				if (!document)
					throw new ApplicationError('NOT_FOUND', 'This financial document does not exist.')
				if (document.revision !== parsed.data.expectedRevision) {
					throw new ApplicationError(
						'STALE_REVISION',
						'This document changed. Reload it and try again.'
					)
				}
				if (document.state !== 'POSTED' || !document.journalEntry || document.reversalEntryId) {
					throw new ApplicationError('INVALID_STATE', 'Only a posted document can be reversed.')
				}
				if (document.allocations.some((allocation) => !allocation.reversal)) {
					throw new ApplicationError(
						'INVALID_STATE',
						'Reverse all active payments before reversing this document.'
					)
				}
				if (parsed.data.reversalDate < dateOnly(document.documentDate)) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'The reversal date cannot be before the document date.'
					)
				}
				assertAccountingDateUnlocked(parsed.data.reversalDate, accountingLockDate)
				assertNotFutureBusinessDate(
					parsed.data.reversalDate,
					businessTimezone,
					'Document reversal date'
				)
				const entryNumber = await allocateJournalEntryNumber(
					transaction,
					actor.businessId,
					parsed.data.reversalDate
				)
				const reversal = await commitPostedJournalEntry(transaction, {
					businessId: actor.businessId,
					journalId: document.journalEntry.journalId,
					postingDate: businessDate(parsed.data.reversalDate),
					reference: entryNumber,
					source: 'REVERSAL',
					sourceReference: document.id,
					reversalOfEntryId: document.journalEntryId,
					createdById: actor.userId,
					lines: document.journalEntry.items.map((item) => ({
						accountId: item.accountId,
						contactId: item.contactId,
						analyticAccountId: item.analyticAccountId,
						description: item.description,
						debit: item.credit,
						credit: item.debit
					}))
				})
				await transaction.financialDocument.update({
					where: { id: document.id },
					data: {
						reversalEntryId: reversal.entryId,
						reversedAt: new Date(),
						reversalReason: parsed.data.reason,
						revision: { increment: 1 }
					}
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action:
							kind === 'CUSTOMER_INVOICE' ? 'customer_invoice.reversed' : 'vendor_bill.reversed',
						targetType: 'FinancialDocument',
						targetId: document.id,
						requestId: parsed.data.operationKey,
						details: { reason: parsed.data.reason, reversalEntryId: reversal.entryId }
					}
				})
				return {
					documentId: document.id,
					documentKind: kind,
					documentNumber: document.number,
					state: 'REVERSED' as const,
					reversalEntry: {
						id: reversal.entryId,
						reference: entryNumber,
						postingDate: parsed.data.reversalDate
					},
					reason: parsed.data.reason
				}
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export function reverseCustomerInvoice(actor: Actor, input: ReverseFinancialDocumentInput) {
	return reverseFinancialDocument(actor, input, 'CUSTOMER_INVOICE')
}

export function reverseVendorBill(actor: Actor, input: ReverseFinancialDocumentInput) {
	return reverseFinancialDocument(actor, input, 'VENDOR_BILL')
}

export { postPayment }
