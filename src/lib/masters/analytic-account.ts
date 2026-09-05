import { z } from 'zod'

export const analyticTypes = ['INCOME', 'EXPENSE'] as const
export type AnalyticType = (typeof analyticTypes)[number]

export const ANALYTIC_TYPE_LABELS: Record<AnalyticType, string> = {
	INCOME: 'Income',
	EXPENSE: 'Expense'
}

export const ANALYTIC_TYPE_HINTS: Record<AnalyticType, string> = {
	INCOME: 'Groups income movements for budgeting and analysis.',
	EXPENSE: 'Groups expense movements for budgeting and analysis.'
}

export const analyticSortColumns = ['name', 'type', 'createdAt'] as const
export type AnalyticSortColumn = (typeof analyticSortColumns)[number]

export const ANALYTIC_SORT_LABELS: Record<AnalyticSortColumn, string> = {
	name: 'Name',
	type: 'Type',
	createdAt: 'Created'
}

export const analyticAccountInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Enter an analytic account name.')
		.max(120, 'Use 120 characters or fewer.'),
	type: z.enum(analyticTypes, { message: 'Choose a type.' })
})

export type AnalyticAccountInput = z.output<typeof analyticAccountInputSchema>

export const analyticAccountListQuerySchema = z.object({
	search: z.string().trim().max(160).default(''),
	type: z.enum([...analyticTypes, 'ALL']).default('ALL'),
	includeArchived: z.boolean().default(false),
	sort: z.enum(analyticSortColumns).default('name'),
	direction: z.enum(['asc', 'desc']).default('asc'),
	page: z.coerce.number().int().min(1).catch(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export type AnalyticAccountListQuery = z.input<typeof analyticAccountListQuerySchema>

export type AnalyticAccountSummary = {
	id: string
	name: string
	type: AnalyticType
	archivedAt: string | null
	revision: number
}

export type AnalyticAccountDetail = AnalyticAccountSummary & {
	journalItemCount: number
	budgetLineCount: number
}
