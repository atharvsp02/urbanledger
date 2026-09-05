import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	asOfReportInputSchema,
	dashboardSummaryInputSchema,
	dateRangeReportInputSchema,
	salesPerformanceInputSchema,
	type AgingBucket,
	type AgingReport,
	type AsOfReportInput,
	type DashboardSummary,
	type DashboardSummaryInput,
	type DateRangeReportInput,
	type RevenueExpenseProfitTrend,
	type SalesPerformance,
	type SalesPerformanceInput
} from '@/lib/contracts/reports'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import {
	formatJournalAmount,
	sumJournalAmounts,
	zeroJournalAmount
} from '@/server/accounting/money'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { calculateDocumentSettlement } from '@/server/payments/settlement'

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
		error: { code: 'DATABASE_UNAVAILABLE', message: 'The analytics report could not be loaded.' }
	}
}

function reportDate(value: string) {
	return new Date(`${value}T00:00:00.000Z`)
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

function agingBucket(asOfDate: string, dueDate: string): AgingBucket {
	if (dueDate >= asOfDate) return 'CURRENT'
	const days = Math.round(
		(reportDate(asOfDate).getTime() - reportDate(dueDate).getTime()) / 86_400_000
	)
	if (days <= 30) return '1_30'
	if (days <= 60) return '31_60'
	if (days <= 90) return '61_90'
	return '90_PLUS'
}

async function buildAging(
	transaction: ReportTransaction,
	actor: Actor,
	timezone: string,
	kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL',
	asOfDate: string
): Promise<AgingReport> {
	const documents = await transaction.financialDocument.findMany({
		where: {
			businessId: actor.businessId,
			kind,
			state: 'POSTED',
			documentDate: { lte: reportDate(asOfDate) }
		},
		select: { id: true },
		orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
	})
	const rows: AgingReport['rows'] = []
	for (const document of documents) {
		const settlement = await calculateDocumentSettlement(transaction, {
			businessId: actor.businessId,
			documentId: document.id,
			asOfDate,
			timezone
		})
		if (settlement.outstandingAmount === '0.00') continue
		rows.push({
			documentId: settlement.document.id,
			documentNumber: settlement.document.number,
			contactId: settlement.document.contact.id,
			contactName: settlement.document.contact.name,
			documentDate: settlement.document.documentDate,
			dueDate: settlement.document.dueDate,
			outstandingAmount: settlement.outstandingAmount,
			bucket: agingBucket(asOfDate, settlement.document.dueDate)
		})
	}
	const bucketValues: Record<AgingBucket, Prisma.Decimal[]> = {
		CURRENT: [],
		'1_30': [],
		'31_60': [],
		'61_90': [],
		'90_PLUS': []
	}
	for (const row of rows) bucketValues[row.bucket].push(new Prisma.Decimal(row.outstandingAmount))
	return {
		asOfDate,
		rows,
		buckets: {
			CURRENT: formatJournalAmount(sumJournalAmounts(bucketValues.CURRENT)),
			'1_30': formatJournalAmount(sumJournalAmounts(bucketValues['1_30'])),
			'31_60': formatJournalAmount(sumJournalAmounts(bucketValues['31_60'])),
			'61_90': formatJournalAmount(sumJournalAmounts(bucketValues['61_90'])),
			'90_PLUS': formatJournalAmount(sumJournalAmounts(bucketValues['90_PLUS']))
		},
		totalOutstanding: formatJournalAmount(
			sumJournalAmounts(rows.map((row) => new Prisma.Decimal(row.outstandingAmount)))
		)
	}
}

async function getAging(
	actor: Actor,
	input: AsOfReportInput,
	kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL'
): Promise<ActionResult<AgingReport>> {
	const parsed = asOfReportInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const business = await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				return buildAging(transaction, actor, business.timezone, kind, parsed.data.asOfDate)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export function getReceivableAging(actor: Actor, input: AsOfReportInput) {
	return getAging(actor, input, 'CUSTOMER_INVOICE')
}

export function getPayableAging(actor: Actor, input: AsOfReportInput) {
	return getAging(actor, input, 'VENDOR_BILL')
}

async function buildTrend(
	transaction: ReportTransaction,
	businessId: string,
	dateFrom: string,
	dateTo: string
): Promise<RevenueExpenseProfitTrend> {
	const items = await transaction.journalItem.findMany({
		where: {
			entry: {
				businessId,
				state: 'POSTED',
				postingDate: { gte: reportDate(dateFrom), lte: reportDate(dateTo) }
			},
			account: { type: { in: ['INCOME', 'EXPENSE'] } }
		},
		select: {
			debit: true,
			credit: true,
			entry: { select: { postingDate: true } },
			account: { select: { type: true } }
		},
		orderBy: [{ entry: { postingDate: 'asc' } }, { id: 'asc' }]
	})
	const periods = new Map<string, { revenue: Prisma.Decimal; expense: Prisma.Decimal }>()
	for (const item of items) {
		const period = dateOnly(item.entry.postingDate).slice(0, 7)
		const current = periods.get(period) ?? {
			revenue: zeroJournalAmount(),
			expense: zeroJournalAmount()
		}
		if (item.account.type === 'INCOME') {
			current.revenue = current.revenue.plus(item.credit).minus(item.debit)
		} else {
			current.expense = current.expense.plus(item.debit).minus(item.credit)
		}
		periods.set(period, current)
	}
	return {
		dateFrom,
		dateTo,
		rows: [...periods.entries()].map(([period, total]) => ({
			period,
			revenue: formatJournalAmount(total.revenue),
			expense: formatJournalAmount(total.expense),
			profit: formatJournalAmount(total.revenue.minus(total.expense))
		}))
	}
}

export async function getRevenueExpenseProfitTrend(
	actor: Actor,
	input: DateRangeReportInput
): Promise<ActionResult<RevenueExpenseProfitTrend>> {
	const parsed = dateRangeReportInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				return buildTrend(transaction, actor.businessId, parsed.data.dateFrom, parsed.data.dateTo)
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getSalesPerformance(
	actor: Actor,
	input: SalesPerformanceInput
): Promise<ActionResult<SalesPerformance>> {
	const parsed = salesPerformanceInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const documents = await transaction.financialDocument.findMany({
					where: {
						businessId: actor.businessId,
						kind: 'CUSTOMER_INVOICE',
						state: 'POSTED',
						OR: [
							{
								journalEntry: {
									postingDate: {
										gte: reportDate(parsed.data.dateFrom),
										lte: reportDate(parsed.data.dateTo)
									}
								}
							},
							{
								reversalEntry: {
									postingDate: {
										gte: reportDate(parsed.data.dateFrom),
										lte: reportDate(parsed.data.dateTo)
									}
								}
							}
						]
					},
					include: {
						journalEntry: { select: { postingDate: true } },
						reversalEntry: { select: { postingDate: true } },
						lines: {
							include: { product: { include: { category: { select: { id: true, name: true } } } } }
						}
					}
				})
				type Aggregate = {
					id: string
					label: string
					netSales: Prisma.Decimal
					quantity: Prisma.Decimal
					documentIds: Set<string>
				}
				const aggregates = new Map<string, Aggregate>()
				for (const document of documents) {
					const postedDate = document.journalEntry
						? dateOnly(document.journalEntry.postingDate)
						: null
					const reversalDate = document.reversalEntry
						? dateOnly(document.reversalEntry.postingDate)
						: null
					const multiplier =
						(postedDate && postedDate >= parsed.data.dateFrom && postedDate <= parsed.data.dateTo
							? 1
							: 0) -
						(reversalDate &&
						reversalDate >= parsed.data.dateFrom &&
						reversalDate <= parsed.data.dateTo
							? 1
							: 0)
					if (multiplier === 0) continue
					for (const line of document.lines) {
						const group =
							parsed.data.dimension === 'PRODUCT'
								? { id: line.productId, label: line.productNameSnapshot }
								: parsed.data.dimension === 'CATEGORY'
									? { id: line.product.category.id, label: line.product.category.name }
									: { id: document.contactId, label: document.contactNameSnapshot }
						const current = aggregates.get(group.id) ?? {
							...group,
							netSales: zeroJournalAmount(),
							quantity: zeroJournalAmount(),
							documentIds: new Set<string>()
						}
						current.netSales = current.netSales.plus(line.lineNetTotal.times(multiplier))
						current.quantity = current.quantity.plus(line.quantity.times(multiplier))
						current.documentIds.add(document.id)
						aggregates.set(group.id, current)
					}
				}
				const rows = [...aggregates.values()]
					.map((row) => ({
						id: row.id,
						label: row.label,
						netSales: formatJournalAmount(row.netSales),
						quantity: row.quantity.toFixed(4),
						documentCount: row.documentIds.size,
						documentIds: [...row.documentIds]
					}))
					.sort((left, right) =>
						left.label === right.label
							? left.id.localeCompare(right.id)
							: left.label.localeCompare(right.label)
					)
				return {
					dateFrom: parsed.data.dateFrom,
					dateTo: parsed.data.dateTo,
					dimension: parsed.data.dimension,
					rows,
					totalNetSales: formatJournalAmount(
						sumJournalAmounts(rows.map((row) => new Prisma.Decimal(row.netSales)))
					)
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}

export async function getDashboardSummary(
	actor: Actor,
	input: DashboardSummaryInput
): Promise<ActionResult<DashboardSummary>> {
	const parsed = dashboardSummaryInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await getPrisma().$transaction(
			async (transaction) => {
				const business = await requireCurrentAccountingActor(transaction, actor, 'reports:read')
				const [receivable, payable, trend, liquidity, activeBudgets] = await Promise.all([
					buildAging(
						transaction,
						actor,
						business.timezone,
						'CUSTOMER_INVOICE',
						parsed.data.asOfDate
					),
					buildAging(transaction, actor, business.timezone, 'VENDOR_BILL', parsed.data.asOfDate),
					buildTrend(transaction, actor.businessId, parsed.data.trendFrom, parsed.data.asOfDate),
					transaction.journalItem.aggregate({
						where: {
							account: {
								businessId: actor.businessId,
								subtype: { in: ['CASH', 'BANK'] }
							},
							entry: {
								businessId: actor.businessId,
								state: 'POSTED',
								postingDate: { lte: reportDate(parsed.data.asOfDate) }
							}
						},
						_sum: { debit: true, credit: true }
					}),
					transaction.budget.count({
						where: {
							businessId: actor.businessId,
							archivedAt: null,
							startsOn: { lte: reportDate(parsed.data.asOfDate) },
							endsOn: { gte: reportDate(parsed.data.asOfDate) }
						}
					})
				])
				const revenue = sumJournalAmounts(trend.rows.map((row) => new Prisma.Decimal(row.revenue)))
				const expense = sumJournalAmounts(trend.rows.map((row) => new Prisma.Decimal(row.expense)))
				const liquidityBalance = (liquidity._sum.debit ?? zeroJournalAmount()).minus(
					liquidity._sum.credit ?? zeroJournalAmount()
				)
				return {
					asOfDate: parsed.data.asOfDate,
					receivableOutstanding: receivable.totalOutstanding,
					payableOutstanding: payable.totalOutstanding,
					liquidityBalance: formatJournalAmount(liquidityBalance),
					periodRevenue: formatJournalAmount(revenue),
					periodExpense: formatJournalAmount(expense),
					periodProfit: formatJournalAmount(revenue.minus(expense)),
					openCustomerInvoices: receivable.rows.length,
					openVendorBills: payable.rows.length,
					activeBudgets,
					trend: trend.rows
				}
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
		)
		return { ok: true, data: result }
	} catch (error) {
		return actionFailure(error)
	}
}
