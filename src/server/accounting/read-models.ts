import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import {
	accountActivityInputSchema,
	journalActivityInputSchema,
	journalEntryDetailInputSchema,
	journalEntryListInputSchema,
	journalPostingOptionsInputSchema,
	type AccountActivityInput,
	type AccountActivityResult,
	type AccountingJournalRef,
	type JournalActivityInput,
	type JournalActivityResult,
	type JournalEntryDetail,
	type JournalEntryDetailInput,
	type JournalEntryListInput,
	type JournalEntryListResult,
	type JournalEntrySummary,
	type JournalPostingOptions,
	type JournalPostingOptionsInput
} from '@/lib/contracts/accounting'
import type { ActionResult } from '@/lib/contracts/errors'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	formatJournalAmount,
	sumJournalAmounts,
	zeroJournalAmount,
	type JournalDecimal
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'

type AccountingTransaction = Prisma.TransactionClient

type EntrySummaryRow = {
	id: string
	reference: string
	postingDate: Date
	source: JournalEntrySummary['source']
	state: JournalEntrySummary['state']
	journal: AccountingJournalRef
	reversedBy: { id: string } | null
	items: readonly { debit: JournalDecimal; credit: JournalDecimal }[]
}

const journalRefSelect = { id: true, code: true, name: true, type: true } as const

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the accounting filters.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError() }
	}

	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'The accounting activity could not be loaded.'
		}
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function dateRange(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
	if (!dateFrom && !dateTo) return undefined

	return {
		...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
		...(dateTo ? { lte: new Date(`${dateTo}T00:00:00.000Z`) } : {})
	}
}

function entryStatus(entry: Pick<EntrySummaryRow, 'source' | 'state' | 'reversedBy'>) {
	if (entry.source === 'REVERSAL') return 'REVERSAL'
	if (entry.reversedBy) return 'REVERSED'
	return entry.state
}

function toEntrySummary(entry: EntrySummaryRow): JournalEntrySummary {
	return {
		id: entry.id,
		reference: entry.reference,
		postingDate: dateOnly(entry.postingDate),
		source: entry.source,
		state: entry.state,
		status: entryStatus(entry),
		journal: entry.journal,
		totalDebit: formatJournalAmount(sumJournalAmounts(entry.items.map((item) => item.debit))),
		totalCredit: formatJournalAmount(sumJournalAmounts(entry.items.map((item) => item.credit))),
		lineCount: entry.items.length
	}
}

function currentBalance(debit: JournalDecimal, credit: JournalDecimal) {
	const balance = debit.minus(credit)
	const direction = balance.isZero() ? 'ZERO' : balance.isPositive() ? 'DR' : 'CR'

	return {
		currentBalance: formatJournalAmount(balance.abs()),
		direction
	} as const
}

async function requireScopedJournal(
	transaction: AccountingTransaction,
	businessId: string,
	journalId: string
) {
	const journal = await transaction.journal.findFirst({
		where: { id: journalId, businessId },
		select: journalRefSelect
	})

	if (!journal) {
		throw new ApplicationError('NOT_FOUND', 'This journal does not exist.')
	}

	return journal
}

export async function listJournalEntries(
	actor: Actor,
	input: JournalEntryListInput = {}
): Promise<ActionResult<JournalEntryListResult>> {
	const parsed = journalEntryListInputSchema.safeParse(input)

	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')

				if (parsed.data.journalId) {
					await requireScopedJournal(transaction, actor.businessId, parsed.data.journalId)
				}

				const where: Prisma.JournalEntryWhereInput = {
					businessId: actor.businessId,
					...(parsed.data.journalId ? { journalId: parsed.data.journalId } : {}),
					...(parsed.data.source === 'ALL' ? {} : { source: parsed.data.source }),
					...(dateRange(parsed.data.dateFrom, parsed.data.dateTo)
						? { postingDate: dateRange(parsed.data.dateFrom, parsed.data.dateTo) }
						: {})
				}
				const totalCount = await transaction.journalEntry.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const rows = await transaction.journalEntry.findMany({
					where,
					include: {
						journal: { select: journalRefSelect },
						reversedBy: { select: { id: true } },
						items: { select: { debit: true, credit: true } }
					},
					orderBy: [{ postingDate: 'desc' }, { reference: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})

				return {
					rows: rows.map(toEntrySummary),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies JournalEntryListResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getJournalEntry(
	actor: Actor,
	input: JournalEntryDetailInput
): Promise<ActionResult<JournalEntryDetail>> {
	const parsed = journalEntryDetailInputSchema.safeParse(input)

	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
			const entry = await transaction.journalEntry.findFirst({
				where: { id: parsed.data.entryId, businessId: actor.businessId },
				include: {
					journal: { select: journalRefSelect },
					createdBy: { select: { id: true, displayName: true } },
					reversalOf: { select: { id: true, reference: true } },
					reversedBy: { select: { id: true, reference: true } },
					items: {
						select: {
							id: true,
							description: true,
							debit: true,
							credit: true,
							account: { select: { id: true, code: true, name: true } },
							contact: { select: { id: true, name: true } },
							analyticAccount: { select: { id: true, name: true } }
						},
						orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
					}
				}
			})

			if (!entry) {
				throw new ApplicationError('NOT_FOUND', 'This journal entry does not exist.')
			}

			const summary = toEntrySummary({
				...entry,
				items: entry.items.map((item) => ({ debit: item.debit, credit: item.credit }))
			})

			return {
				...summary,
				sourceReference: entry.sourceReference,
				createdBy: entry.createdBy,
				postedAt: entry.postedAt?.toISOString() ?? null,
				originalEntry: entry.reversalOf,
				reversalEntry: entry.reversedBy,
				lines: entry.items.map((item) => ({
					id: item.id,
					account: item.account,
					contact: item.contact,
					analyticAccount: item.analyticAccount,
					description: item.description,
					debit: formatJournalAmount(item.debit),
					credit: formatJournalAmount(item.credit)
				}))
			} satisfies JournalEntryDetail
		})

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getAccountActivity(
	actor: Actor,
	input: AccountActivityInput
): Promise<ActionResult<AccountActivityResult>> {
	const parsed = accountActivityInputSchema.safeParse(input)

	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const account = await transaction.ledgerAccount.findFirst({
					where: { id: parsed.data.accountId, businessId: actor.businessId },
					select: { id: true, code: true, name: true, type: true, subtype: true }
				})

				if (!account) {
					throw new ApplicationError('NOT_FOUND', 'This account does not exist.')
				}

				const postedWhere: Prisma.JournalItemWhereInput = {
					accountId: account.id,
					entry: { businessId: actor.businessId, state: 'POSTED' }
				}
				const totals = await transaction.journalItem.aggregate({
					where: postedWhere,
					_sum: { debit: true, credit: true }
				})
				const totalDebit = totals._sum.debit ?? zeroJournalAmount()
				const totalCredit = totals._sum.credit ?? zeroJournalAmount()
				const postingDate = dateRange(parsed.data.dateFrom, parsed.data.dateTo)
				const rowWhere: Prisma.JournalItemWhereInput = {
					...postedWhere,
					entry: {
						businessId: actor.businessId,
						state: 'POSTED',
						...(postingDate ? { postingDate } : {})
					}
				}
				const totalCount = await transaction.journalItem.count({ where: rowWhere })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const rows = await transaction.journalItem.findMany({
					where: rowWhere,
					select: {
						id: true,
						description: true,
						debit: true,
						credit: true,
						contact: { select: { id: true, name: true } },
						entry: {
							select: {
								id: true,
								reference: true,
								postingDate: true,
								source: true,
								journal: { select: journalRefSelect }
							}
						}
					},
					orderBy: [
						{ entry: { postingDate: 'desc' } },
						{ entry: { reference: 'desc' } },
						{ id: 'asc' }
					],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})

				return {
					account,
					...currentBalance(totalDebit, totalCredit),
					totalDebit: formatJournalAmount(totalDebit),
					totalCredit: formatJournalAmount(totalCredit),
					rows: rows.map((item) => ({
						itemId: item.id,
						entryId: item.entry.id,
						postingDate: dateOnly(item.entry.postingDate),
						journal: item.entry.journal,
						reference: item.entry.reference,
						source: item.entry.source,
						description: item.description,
						contact: item.contact,
						debit: formatJournalAmount(item.debit),
						credit: formatJournalAmount(item.credit)
					})),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies AccountActivityResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getJournalActivity(
	actor: Actor,
	input: JournalActivityInput
): Promise<ActionResult<JournalActivityResult>> {
	const parsed = journalActivityInputSchema.safeParse(input)

	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'transactions:read')
				const journal = await requireScopedJournal(
					transaction,
					actor.businessId,
					parsed.data.journalId
				)
				const postedEntryWhere: Prisma.JournalEntryWhereInput = {
					businessId: actor.businessId,
					journalId: journal.id,
					state: 'POSTED'
				}
				const postedEntryCount = await transaction.journalEntry.count({
					where: postedEntryWhere
				})
				const totals = await transaction.journalItem.aggregate({
					where: { entry: postedEntryWhere },
					_sum: { debit: true, credit: true }
				})
				const postingDate = dateRange(parsed.data.dateFrom, parsed.data.dateTo)
				const rowWhere: Prisma.JournalEntryWhereInput = {
					...postedEntryWhere,
					...(postingDate ? { postingDate } : {})
				}
				const totalCount = await transaction.journalEntry.count({ where: rowWhere })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const rows = await transaction.journalEntry.findMany({
					where: rowWhere,
					include: {
						journal: { select: journalRefSelect },
						reversedBy: { select: { id: true } },
						items: { select: { debit: true, credit: true } }
					},
					orderBy: [{ postingDate: 'desc' }, { reference: 'desc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})

				return {
					journal,
					postedEntryCount,
					totalDebit: formatJournalAmount(totals._sum.debit ?? zeroJournalAmount()),
					totalCredit: formatJournalAmount(totals._sum.credit ?? zeroJournalAmount()),
					rows: rows.map(toEntrySummary),
					totalCount,
					page,
					pageSize: parsed.data.pageSize,
					lastPage
				} satisfies JournalActivityResult
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getJournalPostingOptions(
	actor: Actor,
	input: JournalPostingOptionsInput = {}
): Promise<ActionResult<JournalPostingOptions>> {
	const parsed = journalPostingOptionsInputSchema.safeParse(input)

	if (!parsed.success) return validationFailure(parsed.error)

	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'transactions:post')
			const journalTypes =
				parsed.data.source === 'ALL'
					? (['GENERAL', 'OPENING'] as const)
					: ([parsed.data.source === 'MANUAL' ? 'GENERAL' : 'OPENING'] as const)
			const [journals, accounts, contacts, analyticAccounts] = await Promise.all([
				transaction.journal.findMany({
					where: {
						businessId: actor.businessId,
						archivedAt: null,
						type: { in: [...journalTypes] }
					},
					select: journalRefSelect,
					orderBy: [{ type: 'asc' }, { code: 'asc' }, { id: 'asc' }]
				}),
				transaction.ledgerAccount.findMany({
					where: {
						businessId: actor.businessId,
						archivedAt: null,
						subtype: { notIn: ['RECEIVABLE', 'PAYABLE'] }
					},
					select: { id: true, code: true, name: true, type: true, subtype: true },
					orderBy: [{ code: 'asc' }, { id: 'asc' }]
				}),
				transaction.contact.findMany({
					where: { businessId: actor.businessId, archivedAt: null },
					select: { id: true, name: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				}),
				transaction.analyticAccount.findMany({
					where: { businessId: actor.businessId, archivedAt: null },
					select: { id: true, name: true, type: true },
					orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }]
				})
			])

			return { journals, accounts, contacts, analyticAccounts } satisfies JournalPostingOptions
		})

		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
