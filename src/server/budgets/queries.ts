import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type {
	BudgetDetail,
	BudgetListInput,
	BudgetListResult,
	BudgetOptions,
	BudgetReport,
	BudgetReportInput,
	BudgetSummary,
	GetBudgetInput
} from '@/lib/contracts/budget'
import {
	budgetListInputSchema,
	budgetReportInputSchema,
	getBudgetInputSchema
} from '@/lib/contracts/budget'
import type { ActionResult } from '@/lib/contracts/errors'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	formatJournalAmount,
	sumJournalAmounts,
	zeroJournalAmount
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage } from '@/server/masters/pagination'

type BudgetTransaction = Prisma.TransactionClient

const budgetInclude = {
	lines: {
		include: { analyticAccount: { select: { id: true, name: true, type: true } } },
		orderBy: [{ analyticAccount: { name: 'asc' as const } }, { id: 'asc' as const }]
	}
} as const

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the budget filters.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) return { ok: false, error: error.toActionError() }
	return {
		ok: false,
		error: { code: 'DATABASE_UNAVAILABLE', message: 'The budget request could not be completed.' }
	}
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function toDetail(
	budget: Prisma.BudgetGetPayload<{ include: typeof budgetInclude }>
): BudgetDetail {
	const plannedTotal = sumJournalAmounts(budget.lines.map((line) => line.plannedAmount))
	return {
		id: budget.id,
		name: budget.name,
		startsOn: dateOnly(budget.startsOn),
		endsOn: dateOnly(budget.endsOn),
		responsible: { id: budget.responsibleUserId, name: budget.responsibleNameSnapshot },
		plannedTotal: formatJournalAmount(plannedTotal),
		lineCount: budget.lines.length,
		revision: budget.revision,
		archivedAt: budget.archivedAt?.toISOString() ?? null,
		lines: budget.lines.map((line) => ({
			id: line.id,
			analyticAccount: line.analyticAccount,
			plannedAmount: formatJournalAmount(line.plannedAmount)
		}))
	}
}

function toSummary(
	budget: Prisma.BudgetGetPayload<{ include: typeof budgetInclude }>
): BudgetSummary {
	const { lines: _lines, ...summary } = toDetail(budget)
	return summary
}

async function loadBudget(transaction: BudgetTransaction, businessId: string, budgetId: string) {
	const budget = await transaction.budget.findFirst({
		where: { id: budgetId, businessId },
		include: budgetInclude
	})
	if (!budget) throw new ApplicationError('NOT_FOUND', 'This budget does not exist.')
	return budget
}

export async function listBudgets(
	actor: Actor,
	input: BudgetListInput = {}
): Promise<ActionResult<BudgetListResult>> {
	const parsed = budgetListInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'masters:read')
				const where: Prisma.BudgetWhereInput = {
					businessId: actor.businessId,
					...(parsed.data.includeArchived ? {} : { archivedAt: null }),
					...(parsed.data.search
						? { name: { contains: parsed.data.search, mode: 'insensitive' } }
						: {})
				}
				const totalCount = await transaction.budget.count({ where })
				const { page, lastPage } = resolvePage(parsed.data.page, parsed.data.pageSize, totalCount)
				const budgets = await transaction.budget.findMany({
					where,
					include: budgetInclude,
					orderBy: [{ startsOn: 'desc' }, { name: 'asc' }, { id: 'asc' }],
					skip: (page - 1) * parsed.data.pageSize,
					take: parsed.data.pageSize
				})
				return {
					rows: budgets.map(toSummary),
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

export async function getBudget(
	actor: Actor,
	input: GetBudgetInput
): Promise<ActionResult<BudgetDetail>> {
	const parsed = getBudgetInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'masters:read')
			return toDetail(await loadBudget(transaction, actor.businessId, parsed.data.budgetId))
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getBudgetOptions(actor: Actor): Promise<ActionResult<BudgetOptions>> {
	try {
		const result = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'masters:read')
			const now = new Date()
			const [responsibleStaff, analyticAccounts] = await Promise.all([
				transaction.applicationUser.findMany({
					where: {
						status: 'ACTIVE',
						disabledAt: null,
						staffGrants: {
							some: {
								businessId: actor.businessId,
								revokedAt: null,
								validFrom: { lte: now },
								OR: [{ validUntil: null }, { validUntil: { gt: now } }]
							}
						}
					},
					select: { id: true, displayName: true },
					orderBy: [{ displayName: 'asc' }, { id: 'asc' }]
				}),
				transaction.analyticAccount.findMany({
					where: { businessId: actor.businessId, archivedAt: null },
					select: { id: true, name: true, type: true },
					orderBy: [{ name: 'asc' }, { id: 'asc' }]
				})
			])
			return { responsibleStaff, analyticAccounts }
		})
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getBudgetReport(
	actor: Actor,
	input: BudgetReportInput
): Promise<ActionResult<BudgetReport>> {
	const parsed = budgetReportInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const budget = await loadBudget(transaction, actor.businessId, parsed.data.budgetId)
				const budgetDetail = toDetail(budget)
				const dateFrom = parsed.data.dateFrom ?? budgetDetail.startsOn
				const dateTo = parsed.data.dateTo ?? budgetDetail.endsOn
				const actualFrom = dateFrom > budgetDetail.startsOn ? dateFrom : budgetDetail.startsOn
				const actualTo = dateTo < budgetDetail.endsOn ? dateTo : budgetDetail.endsOn
				const hasOverlap = actualFrom <= actualTo
				const totals = hasOverlap
					? await transaction.journalItem.groupBy({
							by: ['analyticAccountId'],
							where: {
								analyticAccountId: { in: budget.lines.map((line) => line.analyticAccountId) },
								entry: {
									businessId: actor.businessId,
									state: 'POSTED',
									postingDate: {
										gte: new Date(`${actualFrom}T00:00:00.000Z`),
										lte: new Date(`${actualTo}T00:00:00.000Z`)
									}
								}
							},
							_sum: { debit: true, credit: true }
						})
					: []
				const byAnalytic = new Map(totals.map((total) => [total.analyticAccountId, total]))
				const lines = budgetDetail.lines.map((line) => {
					const total = byAnalytic.get(line.analyticAccount.id)
					const debit = total?._sum.debit ?? zeroJournalAmount()
					const credit = total?._sum.credit ?? zeroJournalAmount()
					const actual =
						line.analyticAccount.type === 'EXPENSE' ? debit.minus(credit) : credit.minus(debit)
					const planned = new Prisma.Decimal(line.plannedAmount)
					const variance =
						line.analyticAccount.type === 'EXPENSE' ? planned.minus(actual) : actual.minus(planned)
					return {
						...line,
						actualAmount: formatJournalAmount(actual),
						variance: formatJournalAmount(variance),
						utilizationPercent: planned.isZero()
							? null
							: actual.times(100).dividedBy(planned).toFixed(2),
						utilizationStatus: planned.isZero() ? ('NO_PLAN' as const) : ('CALCULATED' as const)
					}
				})
				const actualTotal = sumJournalAmounts(
					lines.map((line) => new Prisma.Decimal(line.actualAmount))
				)
				const { lines: _lines, ...summary } = budgetDetail
				return {
					budget: summary,
					filter: { dateFrom, dateTo },
					lines,
					plannedTotal: budgetDetail.plannedTotal,
					actualTotal: formatJournalAmount(actualTotal)
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
