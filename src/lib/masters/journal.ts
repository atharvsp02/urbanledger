import { z } from 'zod'
import type { AccountSubtype, AccountType } from '@/lib/masters/ledger-account'

export const journalTypes = ['SALES', 'PURCHASE', 'BANK', 'CASH', 'GENERAL', 'OPENING'] as const
export type JournalType = (typeof journalTypes)[number]

export const JOURNAL_TYPE_LABELS: Record<JournalType, string> = {
	SALES: 'Sales',
	PURCHASE: 'Purchase',
	BANK: 'Bank',
	CASH: 'Cash',
	GENERAL: 'General',
	OPENING: 'Opening'
}

export const JOURNAL_TYPE_HINTS: Record<JournalType, string> = {
	SALES: 'Posts customer invoices to an income account and a receivable control account.',
	PURCHASE: 'Posts vendor bills to an expense account and a payable control account.',
	BANK: 'Settles documents through a bank liquidity account.',
	CASH: 'Settles documents through a cash liquidity account.',
	GENERAL: 'Manual entries with no default mapping.',
	OPENING: 'Opening balances with no default mapping.'
}

export type JournalDefaultField =
	| 'defaultIncomeAccountId'
	| 'defaultExpenseAccountId'
	| 'defaultControlAccountId'
	| 'defaultLiquidityAccountId'

export type JournalDefaultRequirement = {
	field: JournalDefaultField
	label: string
	hint: string
	accountType: AccountType
	subtypes: readonly AccountSubtype[] | null
}

const SALES_REQUIREMENTS: readonly JournalDefaultRequirement[] = [
	{
		field: 'defaultIncomeAccountId',
		label: 'Income account',
		hint: 'Revenue recognised when a customer invoice is posted.',
		accountType: 'INCOME',
		subtypes: null
	},
	{
		field: 'defaultControlAccountId',
		label: 'Receivable control account',
		hint: 'Amounts owed by customers.',
		accountType: 'ASSET',
		subtypes: ['RECEIVABLE']
	}
]

const PURCHASE_REQUIREMENTS: readonly JournalDefaultRequirement[] = [
	{
		field: 'defaultExpenseAccountId',
		label: 'Expense account',
		hint: 'Purchase expense recognised when a vendor bill is posted.',
		accountType: 'EXPENSE',
		subtypes: null
	},
	{
		field: 'defaultControlAccountId',
		label: 'Payable control account',
		hint: 'Amounts owed to vendors.',
		accountType: 'LIABILITY',
		subtypes: ['PAYABLE']
	}
]

const BANK_REQUIREMENTS: readonly JournalDefaultRequirement[] = [
	{
		field: 'defaultLiquidityAccountId',
		label: 'Bank account',
		hint: 'The liquid asset account this journal moves money through.',
		accountType: 'ASSET',
		subtypes: ['BANK']
	}
]

const CASH_REQUIREMENTS: readonly JournalDefaultRequirement[] = [
	{
		field: 'defaultLiquidityAccountId',
		label: 'Cash account',
		hint: 'The liquid asset account this journal moves money through.',
		accountType: 'ASSET',
		subtypes: ['CASH']
	}
]

export const JOURNAL_REQUIREMENTS: Record<JournalType, readonly JournalDefaultRequirement[]> = {
	SALES: SALES_REQUIREMENTS,
	PURCHASE: PURCHASE_REQUIREMENTS,
	BANK: BANK_REQUIREMENTS,
	CASH: CASH_REQUIREMENTS,
	GENERAL: [],
	OPENING: []
}

export const journalSortColumns = ['code', 'name', 'type', 'createdAt'] as const
export type JournalSortColumn = (typeof journalSortColumns)[number]

export const JOURNAL_SORT_LABELS: Record<JournalSortColumn, string> = {
	code: 'Code',
	name: 'Name',
	type: 'Type',
	createdAt: 'Created'
}

const optionalAccountId = z
	.string()
	.trim()
	.transform((value) => (value.length === 0 ? null : value))
	.nullable()
	.refine((value) => value === null || z.uuid().safeParse(value).success, {
		message: 'Choose an available account.'
	})

export const journalInputSchema = z
	.object({
		code: z
			.string()
			.trim()
			.min(1, 'Enter a journal code.')
			.max(16, 'Use 16 characters or fewer.')
			.regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, underscores and hyphens.'),
		name: z
			.string()
			.trim()
			.min(1, 'Enter a journal name.')
			.max(120, 'Use 120 characters or fewer.'),
		type: z.enum(journalTypes, { message: 'Choose a journal type.' }),
		defaultIncomeAccountId: optionalAccountId,
		defaultExpenseAccountId: optionalAccountId,
		defaultControlAccountId: optionalAccountId,
		defaultLiquidityAccountId: optionalAccountId
	})
	.superRefine((input, context) => {
		for (const requirement of JOURNAL_REQUIREMENTS[input.type]) {
			if (input[requirement.field] === null) {
				context.addIssue({
					code: 'custom',
					path: [requirement.field],
					message: `${JOURNAL_TYPE_LABELS[input.type]} journals require a ${requirement.label.toLowerCase()}.`
				})
			}
		}
	})

export type JournalInput = z.output<typeof journalInputSchema>

export const journalListQuerySchema = z.object({
	type: z.enum([...journalTypes, 'ALL']).default('ALL'),
	includeArchived: z.boolean().default(false),
	sort: z.enum(journalSortColumns).default('code'),
	direction: z.enum(['asc', 'desc']).default('asc')
})

export type JournalListQuery = z.input<typeof journalListQuerySchema>

export type JournalAccountRef = { id: string; code: string; name: string }

export type JournalSummary = {
	id: string
	code: string
	name: string
	type: JournalType
	archivedAt: string | null
	revision: number
	defaultIncomeAccount: JournalAccountRef | null
	defaultExpenseAccount: JournalAccountRef | null
	defaultControlAccount: JournalAccountRef | null
	defaultLiquidityAccount: JournalAccountRef | null
}

export type JournalDetail = JournalSummary & { entryCount: number }
