import { z } from 'zod'

export const accountTypes = ['ASSET', 'LIABILITY', 'EXPENSE', 'INCOME', 'CAPITAL'] as const
export type AccountType = (typeof accountTypes)[number]

export const accountSubtypes = [
	'GENERAL',
	'CASH',
	'BANK',
	'RECEIVABLE',
	'PAYABLE',
	'INPUT_TAX',
	'OUTPUT_TAX'
] as const
export type AccountSubtype = (typeof accountSubtypes)[number]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
	ASSET: 'Asset',
	LIABILITY: 'Liability',
	EXPENSE: 'Expense',
	INCOME: 'Income',
	CAPITAL: 'Capital'
}

export const ACCOUNT_SUBTYPE_LABELS: Record<AccountSubtype, string> = {
	GENERAL: 'General',
	CASH: 'Cash',
	BANK: 'Bank',
	RECEIVABLE: 'Receivable',
	PAYABLE: 'Payable',
	INPUT_TAX: 'Input tax',
	OUTPUT_TAX: 'Output tax'
}

const SUBTYPE_REQUIRED_TYPE: Partial<Record<AccountSubtype, AccountType>> = {
	CASH: 'ASSET',
	BANK: 'ASSET',
	RECEIVABLE: 'ASSET',
	INPUT_TAX: 'ASSET',
	PAYABLE: 'LIABILITY',
	OUTPUT_TAX: 'LIABILITY'
}

export function requiredTypeForSubtype(subtype: AccountSubtype) {
	return SUBTYPE_REQUIRED_TYPE[subtype] ?? null
}

export function isSubtypeCompatible(type: AccountType, subtype: AccountSubtype) {
	const required = requiredTypeForSubtype(subtype)
	return required === null || required === type
}

export const accountSortColumns = ['code', 'name', 'type', 'createdAt'] as const
export type AccountSortColumn = (typeof accountSortColumns)[number]

export const ACCOUNT_SORT_LABELS: Record<AccountSortColumn, string> = {
	code: 'Code',
	name: 'Name',
	type: 'Classification',
	createdAt: 'Created'
}

export const ledgerAccountInputSchema = z
	.object({
		code: z
			.string()
			.trim()
			.min(1, 'Enter an account code.')
			.max(32, 'Use 32 characters or fewer.')
			.regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, underscores and hyphens.'),
		name: z
			.string()
			.trim()
			.min(1, 'Enter an account name.')
			.max(160, 'Use 160 characters or fewer.'),
		type: z.enum(accountTypes, { message: 'Choose a classification.' }),
		subtype: z.enum(accountSubtypes, { message: 'Choose a subtype.' })
	})
	.refine((input) => isSubtypeCompatible(input.type, input.subtype), {
		message: 'This subtype is not available for the chosen classification.',
		path: ['subtype']
	})

export type LedgerAccountInput = z.output<typeof ledgerAccountInputSchema>

export const ledgerAccountListQuerySchema = z.object({
	search: z.string().trim().max(160).default(''),
	type: z.enum([...accountTypes, 'ALL']).default('ALL'),
	includeArchived: z.boolean().default(false),
	sort: z.enum(accountSortColumns).default('code'),
	direction: z.enum(['asc', 'desc']).default('asc'),
	page: z.coerce.number().int().min(1).catch(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export type LedgerAccountListQuery = z.input<typeof ledgerAccountListQuerySchema>

export type LedgerAccountSummary = {
	id: string
	code: string
	name: string
	type: AccountType
	subtype: AccountSubtype
	archivedAt: string | null
	revision: number
}

export type LedgerAccountDetail = LedgerAccountSummary & {
	journalItemCount: number
	defaultOfJournals: readonly { id: string; code: string; name: string }[]
	defaultOfTaxes: readonly { id: string; name: string }[]
}
