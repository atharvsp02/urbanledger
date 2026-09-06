import { z } from 'zod'

const moneyInputSchema = z
	.string()
	.trim()
	.regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/, 'Enter a non-negative amount.')
const moneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
const budgetFields = {
	name: z.string().trim().min(1).max(160),
	startsOn: z.iso.date(),
	endsOn: z.iso.date(),
	responsibleUserId: z.uuid(),
	lines: z
		.array(z.object({ analyticAccountId: z.uuid(), plannedAmount: moneyInputSchema }))
		.min(1)
		.max(100)
} as const

function validBudgetDates(input: { startsOn: string; endsOn: string }) {
	return input.startsOn <= input.endsOn
}

function uniqueAnalytics(input: { lines: Array<{ analyticAccountId: string }> }) {
	return new Set(input.lines.map((line) => line.analyticAccountId)).size === input.lines.length
}

export const createBudgetInputSchema = z
	.object({ operationKey: z.uuid(), ...budgetFields })
	.refine(validBudgetDates, { message: 'End date cannot precede start date.', path: ['endsOn'] })
	.refine(uniqueAnalytics, {
		message: 'Choose each Analytic Account only once.',
		path: ['lines']
	})

export const updateBudgetInputSchema = z
	.object({
		operationKey: z.uuid(),
		budgetId: z.uuid(),
		expectedRevision: z.number().int().positive(),
		...budgetFields
	})
	.refine(validBudgetDates, { message: 'End date cannot precede start date.', path: ['endsOn'] })
	.refine(uniqueAnalytics, {
		message: 'Choose each Analytic Account only once.',
		path: ['lines']
	})

export const budgetArchiveInputSchema = z.object({
	operationKey: z.uuid(),
	budgetId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const budgetListInputSchema = z.object({
	search: z.string().trim().max(160).default(''),
	includeArchived: z.boolean().default(false),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export const getBudgetInputSchema = z.object({ budgetId: z.uuid() })

export const budgetReportInputSchema = z
	.object({
		budgetId: z.uuid(),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional()
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const budgetMutationResultSchema = z.object({
	budgetId: z.uuid(),
	revision: z.number().int().positive(),
	archivedAt: z.iso.datetime().nullable()
})

export type CreateBudgetInput = z.input<typeof createBudgetInputSchema>
export type UpdateBudgetInput = z.input<typeof updateBudgetInputSchema>
export type BudgetArchiveInput = z.input<typeof budgetArchiveInputSchema>
export type BudgetListInput = z.input<typeof budgetListInputSchema>
export type GetBudgetInput = z.input<typeof getBudgetInputSchema>
export type BudgetReportInput = z.input<typeof budgetReportInputSchema>
export type BudgetMutationResult = z.output<typeof budgetMutationResultSchema>

export type BudgetLineDetail = {
	id: string
	analyticAccount: { id: string; name: string; type: 'INCOME' | 'EXPENSE' }
	plannedAmount: string
}

export type BudgetSummary = {
	id: string
	name: string
	startsOn: string
	endsOn: string
	responsible: { id: string; name: string }
	plannedTotal: string
	lineCount: number
	revision: number
	archivedAt: string | null
}

export type BudgetDetail = BudgetSummary & { lines: BudgetLineDetail[] }

export type BudgetListResult = {
	rows: BudgetSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type BudgetOptions = {
	responsibleStaff: Array<{ id: string; displayName: string }>
	analyticAccounts: Array<{ id: string; name: string; type: 'INCOME' | 'EXPENSE' }>
}

export type BudgetReportLine = BudgetLineDetail & {
	actualAmount: string
	variance: string
	utilizationPercent: string | null
	utilizationStatus: 'CALCULATED' | 'NO_PLAN'
}

export type BudgetReport = {
	budget: Omit<BudgetDetail, 'lines'>
	filter: { dateFrom: string; dateTo: string }
	lines: BudgetReportLine[]
	plannedTotal: string
	actualTotal: string
	varianceTotal: string
}

export { moneySchema as budgetMoneySchema }
