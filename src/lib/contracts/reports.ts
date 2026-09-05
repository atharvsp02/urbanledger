import { z } from 'zod'

const dateRangeSchema = z
	.object({ dateFrom: z.iso.date(), dateTo: z.iso.date() })
	.refine((input) => input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const asOfReportInputSchema = z.object({ asOfDate: z.iso.date() })
export const dateRangeReportInputSchema = dateRangeSchema
export const budgetPerformanceInputSchema = dateRangeSchema.extend({
	budgetId: z.uuid().optional()
})
export const salesPerformanceInputSchema = dateRangeSchema.extend({
	dimension: z.enum(['PRODUCT', 'CATEGORY', 'CUSTOMER'])
})
export const dashboardSummaryInputSchema = z
	.object({
		asOfDate: z.iso.date(),
		trendFrom: z.iso.date()
	})
	.refine((input) => input.trendFrom <= input.asOfDate, {
		message: 'The trend start date must not be after the as-of date.',
		path: ['trendFrom']
	})

export type AsOfReportInput = z.input<typeof asOfReportInputSchema>
export type DateRangeReportInput = z.input<typeof dateRangeReportInputSchema>
export type BudgetPerformanceInput = z.input<typeof budgetPerformanceInputSchema>
export type SalesPerformanceInput = z.input<typeof salesPerformanceInputSchema>
export type DashboardSummaryInput = z.input<typeof dashboardSummaryInputSchema>

export type ReportAccountRow = {
	accountId: string
	accountCode: string
	accountName: string
	amount: string
}

export type BalanceSheet = {
	asOfDate: string
	assets: { rows: ReportAccountRow[]; total: string }
	liabilities: { rows: ReportAccountRow[]; total: string }
	equity: { rows: ReportAccountRow[]; derivedEarnings: string; total: string }
	totalLiabilitiesAndEquity: string
	difference: string
	balanced: boolean
}

export type ProfitAndLoss = {
	dateFrom: string
	dateTo: string
	income: { rows: ReportAccountRow[]; total: string }
	expenses: { rows: ReportAccountRow[]; total: string }
	profit: string
}

export type BudgetPerformanceRow = {
	budgetId: string
	budgetName: string
	analyticAccountId: string
	analyticAccountName: string
	analyticType: 'INCOME' | 'EXPENSE'
	plannedAmount: string
	actualAmount: string
	variance: string
	utilizationPercent: string | null
}

export type BudgetPerformance = {
	dateFrom: string
	dateTo: string
	rows: BudgetPerformanceRow[]
}

export type LiquidityMovement = {
	dateFrom: string
	dateTo: string
	rows: Array<
		ReportAccountRow & {
			openingBalance: string
			inflow: string
			outflow: string
			netMovement: string
			closingBalance: string
		}
	>
	totalOpening: string
	totalInflow: string
	totalOutflow: string
	totalNetMovement: string
	totalClosing: string
}

export type AgingBucket = 'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS'

export type AgingRow = {
	documentId: string
	documentNumber: string
	contactId: string
	contactName: string
	documentDate: string
	dueDate: string
	outstandingAmount: string
	bucket: AgingBucket
}

export type AgingReport = {
	asOfDate: string
	rows: AgingRow[]
	buckets: Record<AgingBucket, string>
	totalOutstanding: string
}

export type RevenueExpenseProfitTrend = {
	dateFrom: string
	dateTo: string
	rows: Array<{ period: string; revenue: string; expense: string; profit: string }>
}

export type SalesPerformance = {
	dateFrom: string
	dateTo: string
	dimension: 'PRODUCT' | 'CATEGORY' | 'CUSTOMER'
	rows: Array<{
		id: string
		label: string
		netSales: string
		quantity: string
		documentCount: number
		documentIds: string[]
	}>
	totalNetSales: string
}

export type DashboardSummary = {
	asOfDate: string
	receivableOutstanding: string
	payableOutstanding: string
	liquidityBalance: string
	periodRevenue: string
	periodExpense: string
	periodProfit: string
	openCustomerInvoices: number
	openVendorBills: number
	activeBudgets: number
	trend: RevenueExpenseProfitTrend['rows']
}
