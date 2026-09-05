import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Prisma, type AccountSubtype, type AccountType } from '@/generated/prisma/client'
import type { Actor, Capability } from '@/lib/contracts/access'
import {
	journalPostingResultSchema,
	manualJournalInputSchema,
	openingJournalInputSchema,
	reverseJournalInputSchema,
	type JournalPostingResult,
	type ManualJournalInput,
	type OpeningJournalInput,
	type ReverseJournalInput
} from '@/lib/contracts/accounting'
import type { ActionResult } from '@/lib/contracts/errors'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	assertJournalAmountRange,
	formatJournalAmount,
	parseJournalAmount,
	sumJournalAmounts,
	type JournalDecimal
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

type PostingSource = 'MANUAL' | 'OPENING'
type PostingInput = z.output<typeof manualJournalInputSchema>
type AccountingTransaction = Prisma.TransactionClient

type NormalizedLine = {
	accountId: string
	contactId: string | null
	analyticAccountId: string | null
	description: string | null
	debit: JournalDecimal
	credit: JournalDecimal
}

type ValidatedPosting = {
	postingDate: Date
	lines: NormalizedLine[]
	totalDebit: JournalDecimal
	totalCredit: JournalDecimal
}

const operationNames = {
	MANUAL: 'journal.manual.post',
	OPENING: 'journal.opening.post',
	REVERSAL: 'journal.reverse'
} as const

const maximumTransactionAttempts = 10

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the journal details.',
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
			message: 'The accounting command could not be completed.',
			requestId
		}
	}
}

function businessDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function dateString(value: Date) {
	return value.toISOString().slice(0, 10)
}

function assertUnlocked(postingDate: string, accountingLockDate: Date | null) {
	if (accountingLockDate && postingDate <= dateString(accountingLockDate)) {
		throw new ApplicationError(
			'LOCKED_PERIOD',
			'The posting date is in a locked accounting period.'
		)
	}
}

function normalizedLines(lines: PostingInput['lines']) {
	return lines.map((line) => ({
		accountId: line.accountId,
		contactId: line.contactId ?? null,
		analyticAccountId: line.analyticAccountId ?? null,
		description: line.description ?? null,
		debit: parseJournalAmount(line.debit),
		credit: parseJournalAmount(line.credit)
	}))
}

function canonicalPostingPayload(actor: Actor, source: PostingSource, input: PostingInput) {
	return {
		operation: operationNames[source],
		actorUserId: actor.userId,
		journalId: input.journalId,
		postingDate: input.postingDate,
		memo: input.memo,
		lines: normalizedLines(input.lines).map((line) => ({
			accountId: line.accountId,
			contactId: line.contactId,
			analyticAccountId: line.analyticAccountId,
			description: line.description,
			debit: formatJournalAmount(line.debit),
			credit: formatJournalAmount(line.credit)
		}))
	}
}

function canonicalReversalPayload(actor: Actor, input: z.output<typeof reverseJournalInputSchema>) {
	return {
		operation: operationNames.REVERSAL,
		actorUserId: actor.userId,
		entryId: input.entryId,
		postingDate: input.postingDate,
		reason: input.reason
	}
}

function requestHash(payload: object) {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
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

async function allocateJournalEntryNumber(
	transaction: AccountingTransaction,
	businessId: string,
	postingDate: string
) {
	const period = postingDate.slice(0, 4)
	const sequence = await transaction.documentSequence.upsert({
		where: {
			businessId_kind_period: { businessId, kind: 'JOURNAL_ENTRY', period }
		},
		create: {
			businessId,
			kind: 'JOURNAL_ENTRY',
			period,
			prefix: `JE/${period}`,
			nextNumber: BigInt('2')
		},
		update: { nextNumber: { increment: 1 } }
	})

	const number = sequence.nextNumber - BigInt('1')
	return `${sequence.prefix}/${number.toString().padStart(6, '0')}`
}

async function loadPostingDependencies(
	transaction: AccountingTransaction,
	actor: Actor,
	source: PostingSource,
	input: PostingInput,
	accountingLockDate: Date | null
): Promise<ValidatedPosting> {
	assertUnlocked(input.postingDate, accountingLockDate)

	const lines = normalizedLines(input.lines)
	const accountIds = [...new Set(lines.map((line) => line.accountId))]
	const contactIds = [...new Set(lines.flatMap((line) => (line.contactId ? [line.contactId] : [])))]
	const analyticAccountIds = [
		...new Set(lines.flatMap((line) => (line.analyticAccountId ? [line.analyticAccountId] : [])))
	]

	const journal = await transaction.journal.findFirst({
		where: { id: input.journalId, businessId: actor.businessId }
	})
	const accounts = await transaction.ledgerAccount.findMany({
		where: { id: { in: accountIds }, businessId: actor.businessId }
	})
	const contacts = await transaction.contact.findMany({
		where: { id: { in: contactIds }, businessId: actor.businessId }
	})
	const analyticAccounts = await transaction.analyticAccount.findMany({
		where: { id: { in: analyticAccountIds }, businessId: actor.businessId }
	})

	if (!journal || accounts.length !== accountIds.length) {
		throw new ApplicationError('NOT_FOUND', 'A selected journal or account was not found.')
	}

	if (
		contacts.length !== contactIds.length ||
		analyticAccounts.length !== analyticAccountIds.length
	) {
		throw new ApplicationError('NOT_FOUND', 'A selected journal line dependency was not found.')
	}

	if (
		journal.archivedAt ||
		accounts.some((account) => account.archivedAt) ||
		contacts.some((contact) => contact.archivedAt) ||
		analyticAccounts.some((account) => account.archivedAt)
	) {
		throw new ApplicationError(
			'ARCHIVED_DEPENDENCY',
			'Archived journals, accounts, contacts, or analytic accounts cannot be used for new postings.'
		)
	}

	const expectedJournalType = source === 'MANUAL' ? 'GENERAL' : 'OPENING'
	if (journal.type !== expectedJournalType) {
		throw new ApplicationError(
			'INVALID_STATE',
			`${source === 'MANUAL' ? 'Manual' : 'Opening'} entries require an active ${expectedJournalType.toLowerCase()} journal.`
		)
	}

	const accountsById = new Map(accounts.map((account) => [account.id, account]))
	const analyticAccountsById = new Map(analyticAccounts.map((account) => [account.id, account]))

	for (const line of lines) {
		const hasDebit = !line.debit.isZero()
		const hasCredit = !line.credit.isZero()

		if (hasDebit === hasCredit) {
			throw new ApplicationError(
				'VALIDATION_ERROR',
				'Each journal line requires either a positive debit or a positive credit.'
			)
		}

		const account = accountsById.get(line.accountId)
		if (!account) {
			throw new ApplicationError('NOT_FOUND', 'A selected ledger account was not found.')
		}

		if (
			source === 'MANUAL' &&
			(account.subtype === 'RECEIVABLE' || account.subtype === 'PAYABLE')
		) {
			throw new ApplicationError(
				'INVALID_STATE',
				'Receivable and payable control accounts require a subledger document.'
			)
		}

		if (source === 'OPENING' && !isOpeningAccount(account.type, account.subtype)) {
			throw new ApplicationError(
				'INVALID_STATE',
				'Opening entries are limited to cash or bank accounts against capital.'
			)
		}

		if (
			source === 'OPENING' &&
			((account.type === 'CAPITAL' && !hasCredit) || (account.type !== 'CAPITAL' && !hasDebit))
		) {
			throw new ApplicationError(
				'INVALID_STATE',
				'Opening cash and bank lines must be debits and capital lines must be credits.'
			)
		}

		if (source === 'OPENING' && (line.contactId || line.analyticAccountId)) {
			throw new ApplicationError(
				'INVALID_STATE',
				'Opening cash and capital lines cannot carry contacts or analytic accounts.'
			)
		}

		if (line.analyticAccountId) {
			const analyticAccount = analyticAccountsById.get(line.analyticAccountId)
			if (
				!analyticAccount ||
				(account.type !== 'INCOME' && account.type !== 'EXPENSE') ||
				analyticAccount.type !== account.type
			) {
				throw new ApplicationError(
					'INVALID_STATE',
					'Analytic accounts must match the income or expense ledger account type.'
				)
			}
		}
	}

	if (source === 'OPENING') {
		const openingAccounts = lines.map((line) => accountsById.get(line.accountId))
		const hasLiquidity = openingAccounts.some(
			(account) => account?.subtype === 'CASH' || account?.subtype === 'BANK'
		)
		const hasCapital = openingAccounts.some((account) => account?.type === 'CAPITAL')

		if (!hasLiquidity || !hasCapital) {
			throw new ApplicationError(
				'INVALID_STATE',
				'Opening entries require at least one cash or bank line and one capital line.'
			)
		}
	}

	const totalDebit = sumJournalAmounts(lines.map((line) => line.debit))
	const totalCredit = sumJournalAmounts(lines.map((line) => line.credit))
	assertJournalAmountRange(totalDebit)
	assertJournalAmountRange(totalCredit)

	if (totalDebit.isZero() || !totalDebit.equals(totalCredit)) {
		throw new ApplicationError(
			'VALIDATION_ERROR',
			'Total debits and credits must be equal and greater than zero.'
		)
	}

	return {
		postingDate: businessDate(input.postingDate),
		lines,
		totalDebit,
		totalCredit
	}
}

function isOpeningAccount(type: AccountType, subtype: AccountSubtype) {
	return type === 'CAPITAL' || subtype === 'CASH' || subtype === 'BANK'
}

async function createPostedJournalEntry(
	transaction: AccountingTransaction,
	actor: Actor,
	input: PostingInput,
	source: PostingSource,
	validated: ValidatedPosting,
	entryNumber: string
): Promise<JournalPostingResult> {
	const entry = await transaction.journalEntry.create({
		data: {
			businessId: actor.businessId,
			journalId: input.journalId,
			postingDate: validated.postingDate,
			reference: entryNumber,
			source,
			createdById: actor.userId
		},
		select: { id: true }
	})

	await transaction.journalItem.createMany({
		data: validated.lines.map((line) => ({
			entryId: entry.id,
			accountId: line.accountId,
			contactId: line.contactId,
			analyticAccountId: line.analyticAccountId,
			description: line.description,
			debit: formatJournalAmount(line.debit),
			credit: formatJournalAmount(line.credit)
		}))
	})

	await transaction.journalEntry.update({
		where: { id: entry.id },
		data: { state: 'POSTED', postedAt: new Date() }
	})

	const result: JournalPostingResult = {
		entryId: entry.id,
		entryNumber,
		postingDate: input.postingDate,
		source,
		reversalOfEntryId: null,
		totalDebit: formatJournalAmount(validated.totalDebit),
		totalCredit: formatJournalAmount(validated.totalCredit)
	}

	await transaction.auditEvent.create({
		data: {
			businessId: actor.businessId,
			actorUserId: actor.userId,
			action: `journal.${source.toLowerCase()}.posted`,
			targetType: 'JournalEntry',
			targetId: entry.id,
			requestId: input.operationKey,
			details: {
				entryNumber,
				memo: input.memo,
				totalDebit: result.totalDebit,
				totalCredit: result.totalCredit
			}
		}
	})

	return result
}

async function executeIdempotentCommand(
	actor: Actor,
	capability: Capability,
	operationKey: string,
	operation: string,
	hash: string,
	command: (
		transaction: AccountingTransaction,
		accountingLockDate: Date | null
	) => Promise<JournalPostingResult>
): Promise<JournalPostingResult> {
	const database = getPrisma()

	for (let attempt = 1; attempt <= maximumTransactionAttempts; attempt += 1) {
		try {
			return await database.$transaction(
				async (transaction) => {
					const business = await requireCurrentAccountingActor(transaction, actor, capability)
					const existing = await transaction.commandOperation.findUnique({
						where: {
							businessId_operationKey: { businessId: actor.businessId, operationKey }
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
							throw new ApplicationError(
								'CONFLICT',
								'The matching accounting command is still being processed.'
							)
						}

						const result = journalPostingResultSchema.safeParse(existing.result)
						if (!result.success) {
							throw new ApplicationError(
								'INVALID_STATE',
								'The stored accounting command result is invalid.'
							)
						}

						return result.data
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

					const result = await command(transaction, business.accountingLockDate)

					await transaction.commandOperation.update({
						where: {
							businessId_operationKey: { businessId: actor.businessId, operationKey }
						},
						data: {
							resourceId: result.entryId,
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
					'The accounting command could not be serialized. Retry with the same operation key.'
				)
			}

			throw error
		}
	}

	throw new ApplicationError('INTERNAL_ERROR', 'The accounting command did not complete.')
}

async function postJournal(
	actor: Actor,
	input: ManualJournalInput | OpeningJournalInput,
	source: PostingSource
): Promise<ActionResult<JournalPostingResult>> {
	const schema = source === 'MANUAL' ? manualJournalInputSchema : openingJournalInputSchema
	const parsed = schema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	const hash = requestHash(canonicalPostingPayload(actor, source, parsed.data))

	try {
		const result = await executeIdempotentCommand(
			actor,
			'transactions:post',
			parsed.data.operationKey,
			operationNames[source],
			hash,
			async (transaction, accountingLockDate) => {
				const validated = await loadPostingDependencies(
					transaction,
					actor,
					source,
					parsed.data,
					accountingLockDate
				)
				const entryNumber = await allocateJournalEntryNumber(
					transaction,
					actor.businessId,
					parsed.data.postingDate
				)

				return createPostedJournalEntry(
					transaction,
					actor,
					parsed.data,
					source,
					validated,
					entryNumber
				)
			}
		)

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export function postManualJournal(actor: Actor, input: ManualJournalInput) {
	return postJournal(actor, input, 'MANUAL')
}

export function postOpeningJournal(actor: Actor, input: OpeningJournalInput) {
	return postJournal(actor, input, 'OPENING')
}

export async function reverseJournalEntry(
	actor: Actor,
	input: ReverseJournalInput
): Promise<ActionResult<JournalPostingResult>> {
	const parsed = reverseJournalInputSchema.safeParse(input)

	if (!parsed.success) {
		return validationFailure(parsed.error)
	}

	const hash = requestHash(canonicalReversalPayload(actor, parsed.data))

	try {
		const result = await executeIdempotentCommand(
			actor,
			'transactions:reverse',
			parsed.data.operationKey,
			operationNames.REVERSAL,
			hash,
			async (transaction, accountingLockDate) => {
				assertUnlocked(parsed.data.postingDate, accountingLockDate)

				const original = await transaction.journalEntry.findFirst({
					where: {
						id: parsed.data.entryId,
						businessId: actor.businessId,
						state: 'POSTED'
					}
				})

				if (!original) {
					throw new ApplicationError('NOT_FOUND', 'The posted journal entry was not found.')
				}

				if (original.source === 'REVERSAL') {
					throw new ApplicationError(
						'INVALID_STATE',
						'A reversal entry cannot be reversed directly.'
					)
				}

				const existingReversal = await transaction.journalEntry.findUnique({
					where: { reversalOfEntryId: original.id },
					select: { id: true }
				})

				if (existingReversal) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The journal entry has already been reversed.'
					)
				}

				const originalJournal = await transaction.journal.findUnique({
					where: { id: original.journalId },
					select: { businessId: true }
				})
				const originalItems = await transaction.journalItem.findMany({
					where: { entryId: original.id }
				})
				const originalAccountIds = [...new Set(originalItems.map((item) => item.accountId))]
				const originalContactIds = [
					...new Set(originalItems.flatMap((item) => (item.contactId ? [item.contactId] : [])))
				]
				const originalAnalyticIds = [
					...new Set(
						originalItems.flatMap((item) =>
							item.analyticAccountId ? [item.analyticAccountId] : []
						)
					)
				]
				const accountCount = await transaction.ledgerAccount.count({
					where: { businessId: actor.businessId, id: { in: originalAccountIds } }
				})
				const contactCount = await transaction.contact.count({
					where: { businessId: actor.businessId, id: { in: originalContactIds } }
				})
				const analyticCount = await transaction.analyticAccount.count({
					where: { businessId: actor.businessId, id: { in: originalAnalyticIds } }
				})

				if (
					originalJournal?.businessId !== actor.businessId ||
					accountCount !== originalAccountIds.length ||
					contactCount !== originalContactIds.length ||
					analyticCount !== originalAnalyticIds.length
				) {
					throw new ApplicationError(
						'INVALID_STATE',
						'The original entry contains a dependency outside the current business.'
					)
				}

				if (parsed.data.postingDate < dateString(original.postingDate)) {
					throw new ApplicationError(
						'VALIDATION_ERROR',
						'A reversal date cannot be earlier than the original posting date.'
					)
				}

				const entryNumber = await allocateJournalEntryNumber(
					transaction,
					actor.businessId,
					parsed.data.postingDate
				)
				const total = sumJournalAmounts(originalItems.map((item) => item.debit))
				const reversal = await transaction.journalEntry.create({
					data: {
						businessId: actor.businessId,
						journalId: original.journalId,
						postingDate: businessDate(parsed.data.postingDate),
						reference: entryNumber,
						source: 'REVERSAL',
						reversalOfEntryId: original.id,
						createdById: actor.userId
					},
					select: { id: true }
				})

				await transaction.journalItem.createMany({
					data: originalItems.map((item) => ({
						entryId: reversal.id,
						accountId: item.accountId,
						contactId: item.contactId,
						analyticAccountId: item.analyticAccountId,
						description: item.description,
						debit: formatJournalAmount(item.credit),
						credit: formatJournalAmount(item.debit)
					}))
				})

				await transaction.journalEntry.update({
					where: { id: reversal.id },
					data: { state: 'POSTED', postedAt: new Date() }
				})

				const commandResult: JournalPostingResult = {
					entryId: reversal.id,
					entryNumber,
					postingDate: parsed.data.postingDate,
					source: 'REVERSAL',
					reversalOfEntryId: original.id,
					totalDebit: formatJournalAmount(total),
					totalCredit: formatJournalAmount(total)
				}

				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'journal.reversed',
						targetType: 'JournalEntry',
						targetId: reversal.id,
						requestId: parsed.data.operationKey,
						details: {
							entryNumber,
							originalEntryId: original.id,
							reason: parsed.data.reason,
							totalDebit: commandResult.totalDebit,
							totalCredit: commandResult.totalCredit
						}
					}
				})

				return commandResult
			}
		)

		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}
