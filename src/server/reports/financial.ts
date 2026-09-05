import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	asOfReportInputSchema,
	budgetPerformanceInputSchema,
	dateRangeReportInputSchema,
	type AsOfReportInput,
	type BalanceSheet,
	type BudgetPerformance,
	type BudgetPerformanceInput,
	type DateRangeReportInput,
	type LiquidityMovement,
	type ProfitAndLoss,
	type ReportAccountRow
} from '@/lib/contracts/reports'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	formatJournalAmount,
	sumJournalAmounts,
	zeroJournalAmount
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

type ReportTransaction = Prisma.TransactionClient

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the report filters.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) return { ok: false, error: error.toActionError() }
	return {
		ok: false,
		error: { code: 'DATABASE_UNAVAILABLE', message: 'The financial report could not be loaded.' }
	}
}

function reportDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function accountRows(
	accounts: Array<{ id: string; code: string; name: string }>,
	totals: Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>,
	normalSide: 'DEBIT' | 'CREDIT'
): ReportAccountRow[] {
	return accounts
		.map((account) => {
			const total = totals.get(account.id) ?? {
				debit: zeroJournalAmount(),
				credit: zeroJournalAmount()
			}
			const amount =
				normalSide === 'DEBIT' ? total.debit.minus(total.credit) : total.credit.minus(total.debit)
			return {
				accountId: account.id,
				accountCode: account.code,
				accountName: account.name,
				amount: formatJournalAmount(amount)
			}
		})
		.filter((row) => !new Prisma.Decimal(row.amount).isZero())
		.sort((left, right) =>
			left.accountCode === right.accountCode
				? left.accountId.localeCompare(right.accountId)
				: left.accountCode.localeCompare(right.accountCode)
		)
}

function rowTotal(rows: ReportAccountRow[]) {
	return sumJournalAmounts(rows.map((row) => new Prisma.Decimal(row.amount)))
}

async function ledgerTotals(
	transaction: ReportTransaction,
	businessId: string,
	postingDate: Prisma.DateTimeFilter
) {
	const grouped = await transaction.journalItem.groupBy({
		by: ['accountId'],
		where: { entry: { businessId, state: 'POSTED', postingDate } },
		_sum: { debit: true, credit: true }
	})
	return new Map(
		grouped.map((row) => [
			row.accountId,
			{
				debit: row._sum.debit ?? zeroJournalAmount(),
				credit: row._sum.credit ?? zeroJournalAmount()
			}
		])
	)
}

export async function getBalanceSheet(
	actor: Actor,
	input: AsOfReportInput
): Promise<ActionResult<BalanceSheet>> {
	const parsed = asOfReportInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const [totals, accounts] = await Promise.all([
					ledgerTotals(transaction, actor.businessId, { lte: reportDate(parsed.data.asOfDate) }),
					transaction.ledgerAccount.findMany({
						where: { businessId: actor.businessId },
						select: { id: true, code: true, name: true, type: true }
					})
				])
				const assets = accountRows(
					accounts.filter((account) => account.type === 'ASSET'),
					totals,
					'DEBIT'
				)
				const liabilities = accountRows(
					accounts.filter((account) => account.type === 'LIABILITY'),
					totals,
					'CREDIT'
				)
				const equity = accountRows(
					accounts.filter((account) => account.type === 'CAPITAL'),
					totals,
					'CREDIT'
				)
				const income = rowTotal(
					accountRows(
						accounts.filter((account) => account.type === 'INCOME'),
						totals,
						'CREDIT'
					)
				)
				const expense = rowTotal(
					accountRows(
						accounts.filter((account) => account.type === 'EXPENSE'),
						totals,
						'DEBIT'
					)
				)
				const derivedEarnings = income.minus(expense)
				const assetTotal = rowTotal(assets)
				const liabilityTotal = rowTotal(liabilities)
				const equityTotal = rowTotal(equity).plus(derivedEarnings)
				const liabilitiesAndEquity = liabilityTotal.plus(equityTotal)
				const difference = assetTotal.minus(liabilitiesAndEquity)
				return {
					asOfDate: parsed.data.asOfDate,
					assets: { rows: assets, total: formatJournalAmount(assetTotal) },
					liabilities: { rows: liabilities, total: formatJournalAmount(liabilityTotal) },
					equity: {
						rows: equity,
						derivedEarnings: formatJournalAmount(derivedEarnings),
						total: formatJournalAmount(equityTotal)
					},
					totalLiabilitiesAndEquity: formatJournalAmount(liabilitiesAndEquity),
					difference: formatJournalAmount(difference),
					balanced: difference.isZero()
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getProfitAndLoss(
	actor: Actor,
	input: DateRangeReportInput
): Promise<ActionResult<ProfitAndLoss>> {
	const parsed = dateRangeReportInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const [totals, accounts] = await Promise.all([
					ledgerTotals(transaction, actor.businessId, {
						gte: reportDate(parsed.data.dateFrom),
						lte: reportDate(parsed.data.dateTo)
					}),
					transaction.ledgerAccount.findMany({
						where: { businessId: actor.businessId, type: { in: ['INCOME', 'EXPENSE'] } },
						select: { id: true, code: true, name: true, type: true }
					})
				])
				const income = accountRows(
					accounts.filter((account) => account.type === 'INCOME'),
					totals,
					'CREDIT'
				)
				const expenses = accountRows(
					accounts.filter((account) => account.type === 'EXPENSE'),
					totals,
					'DEBIT'
				)
				const incomeTotal = rowTotal(income)
				const expenseTotal = rowTotal(expenses)
				return {
					dateFrom: parsed.data.dateFrom,
					dateTo: parsed.data.dateTo,
					income: { rows: income, total: formatJournalAmount(incomeTotal) },
					expenses: { rows: expenses, total: formatJournalAmount(expenseTotal) },
					profit: formatJournalAmount(incomeTotal.minus(expenseTotal))
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getLiquidityMovement(
	actor: Actor,
	input: DateRangeReportInput
): Promise<ActionResult<LiquidityMovement>> {
	const parsed = dateRangeReportInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const accounts = await transaction.ledgerAccount.findMany({
					where: { businessId: actor.businessId, subtype: { in: ['CASH', 'BANK'] } },
					select: { id: true, code: true, name: true },
					orderBy: [{ code: 'asc' }, { id: 'asc' }]
				})
				const accountIds = accounts.map((account) => account.id)
				const [opening, movement] = await Promise.all([
					transaction.journalItem.groupBy({
						by: ['accountId'],
						where: {
							accountId: { in: accountIds },
							entry: {
								businessId: actor.businessId,
								state: 'POSTED',
								postingDate: { lt: reportDate(parsed.data.dateFrom) }
							}
						},
						_sum: { debit: true, credit: true }
					}),
					transaction.journalItem.groupBy({
						by: ['accountId'],
						where: {
							accountId: { in: accountIds },
							entry: {
								businessId: actor.businessId,
								state: 'POSTED',
								postingDate: {
									gte: reportDate(parsed.data.dateFrom),
									lte: reportDate(parsed.data.dateTo)
								}
							}
						},
						_sum: { debit: true, credit: true }
					})
				])
				const openingByAccount = new Map(opening.map((row) => [row.accountId, row]))
				const movementByAccount = new Map(movement.map((row) => [row.accountId, row]))
				const rows = accounts.map((account) => {
					const before = openingByAccount.get(account.id)
					const during = movementByAccount.get(account.id)
					const openingBalance = (before?._sum.debit ?? zeroJournalAmount()).minus(
						before?._sum.credit ?? zeroJournalAmount()
					)
					const inflow = during?._sum.debit ?? zeroJournalAmount()
					const outflow = during?._sum.credit ?? zeroJournalAmount()
					const netMovement = inflow.minus(outflow)
					const closingBalance = openingBalance.plus(netMovement)
					return {
						accountId: account.id,
						accountCode: account.code,
						accountName: account.name,
						amount: formatJournalAmount(closingBalance),
						openingBalance: formatJournalAmount(openingBalance),
						inflow: formatJournalAmount(inflow),
						outflow: formatJournalAmount(outflow),
						netMovement: formatJournalAmount(netMovement),
						closingBalance: formatJournalAmount(closingBalance)
					}
				})
				const sum = (field: keyof (typeof rows)[number]) =>
					sumJournalAmounts(rows.map((row) => new Prisma.Decimal(String(row[field]))))
				return {
					dateFrom: parsed.data.dateFrom,
					dateTo: parsed.data.dateTo,
					rows,
					totalOpening: formatJournalAmount(sum('openingBalance')),
					totalInflow: formatJournalAmount(sum('inflow')),
					totalOutflow: formatJournalAmount(sum('outflow')),
					totalNetMovement: formatJournalAmount(sum('netMovement')),
					totalClosing: formatJournalAmount(sum('closingBalance'))
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getBudgetPerformance(
	actor: Actor,
	input: BudgetPerformanceInput
): Promise<ActionResult<BudgetPerformance>> {
	const parsed = budgetPerformanceInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const budgets = await transaction.budget.findMany({
					where: {
						businessId: actor.businessId,
						...(parsed.data.budgetId ? { id: parsed.data.budgetId } : {}),
						startsOn: { lte: reportDate(parsed.data.dateTo) },
						endsOn: { gte: reportDate(parsed.data.dateFrom) }
					},
					include: { lines: { include: { analyticAccount: true } } },
					orderBy: [{ startsOn: 'asc' }, { name: 'asc' }, { id: 'asc' }]
				})
				if (parsed.data.budgetId && budgets.length === 0) {
					throw new ApplicationError(
						'NOT_FOUND',
						'This budget does not exist in the report period.'
					)
				}
				const rows = [] as BudgetPerformance['rows']
				for (const budget of budgets) {
					const startsOn = budget.startsOn.toISOString().slice(0, 10)
					const endsOn = budget.endsOn.toISOString().slice(0, 10)
					const actualFrom = parsed.data.dateFrom > startsOn ? parsed.data.dateFrom : startsOn
					const actualTo = parsed.data.dateTo < endsOn ? parsed.data.dateTo : endsOn
					const totals = await transaction.journalItem.groupBy({
						by: ['analyticAccountId'],
						where: {
							analyticAccountId: { in: budget.lines.map((line) => line.analyticAccountId) },
							entry: {
								businessId: actor.businessId,
								state: 'POSTED',
								postingDate: { gte: reportDate(actualFrom), lte: reportDate(actualTo) }
							}
						},
						_sum: { debit: true, credit: true }
					})
					const byAnalytic = new Map(totals.map((total) => [total.analyticAccountId, total]))
					for (const line of budget.lines) {
						const total = byAnalytic.get(line.analyticAccountId)
						const debit = total?._sum.debit ?? zeroJournalAmount()
						const credit = total?._sum.credit ?? zeroJournalAmount()
						const actual =
							line.analyticAccount.type === 'EXPENSE' ? debit.minus(credit) : credit.minus(debit)
						const variance =
							line.analyticAccount.type === 'EXPENSE'
								? line.plannedAmount.minus(actual)
								: actual.minus(line.plannedAmount)
						rows.push({
							budgetId: budget.id,
							budgetName: budget.name,
							analyticAccountId: line.analyticAccountId,
							analyticAccountName: line.analyticAccount.name,
							analyticType: line.analyticAccount.type,
							plannedAmount: formatJournalAmount(line.plannedAmount),
							actualAmount: formatJournalAmount(actual),
							variance: formatJournalAmount(variance),
							utilizationPercent: line.plannedAmount.isZero()
								? null
								: actual.times(100).dividedBy(line.plannedAmount).toFixed(2)
						})
					}
				}
				return { dateFrom: parsed.data.dateFrom, dateTo: parsed.data.dateTo, rows }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
