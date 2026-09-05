import { z } from 'zod'
import type { AccountSubtype, AccountType } from '@/lib/masters/ledger-account'

export const taxScopes = ['SALES', 'PURCHASE', 'BOTH'] as const
export type TaxScope = (typeof taxScopes)[number]

export const TAX_SCOPE_LABELS: Record<TaxScope, string> = {
	SALES: 'Sales',
	PURCHASE: 'Purchase',
	BOTH: 'Both'
}

export const TAX_SCOPE_HINTS: Record<TaxScope, string> = {
	SALES: 'Applied to customer invoices and collected as output tax.',
	PURCHASE: 'Applied to vendor bills and recovered as input tax.',
	BOTH: 'Applied to sales and purchases, with both mappings required.'
}

export type TaxAccountField = 'inputAccountId' | 'outputAccountId'

export type TaxAccountRequirement = {
	field: TaxAccountField
	label: string
	hint: string
	accountType: AccountType
	subtype: AccountSubtype
}

const INPUT_REQUIREMENT: TaxAccountRequirement = {
	field: 'inputAccountId',
	label: 'Input tax account',
	hint: 'Recoverable tax paid on purchases is an asset, not an expense.',
	accountType: 'ASSET',
	subtype: 'INPUT_TAX'
}

const OUTPUT_REQUIREMENT: TaxAccountRequirement = {
	field: 'outputAccountId',
	label: 'Output tax account',
	hint: 'Tax collected on sales is owed onward, so it is a liability.',
	accountType: 'LIABILITY',
	subtype: 'OUTPUT_TAX'
}

export const TAX_REQUIREMENTS: Record<TaxScope, readonly TaxAccountRequirement[]> = {
	SALES: [OUTPUT_REQUIREMENT],
	PURCHASE: [INPUT_REQUIREMENT],
	BOTH: [INPUT_REQUIREMENT, OUTPUT_REQUIREMENT]
}

export const taxSortColumns = ['name', 'rate', 'scope', 'createdAt'] as const
export type TaxSortColumn = (typeof taxSortColumns)[number]

export const TAX_SORT_LABELS: Record<TaxSortColumn, string> = {
	name: 'Name',
	rate: 'Rate',
	scope: 'Scope',
	createdAt: 'Created'
}

// Rates are decimal strings between 0 and 100 with the column's four-decimal
// scale; percentages never pass through binary floating point.
export const taxRateSchema = z
	.string()
	.trim()
	.regex(
		/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/,
		'Enter a rate between 0 and 100 with up to four decimals.'
	)

const optionalAccountId = z
	.string()
	.trim()
	.transform((value) => (value.length === 0 ? null : value))
	.nullable()
	.refine((value) => value === null || z.uuid().safeParse(value).success, {
		message: 'Choose an available account.'
	})

export const taxInputSchema = z
	.object({
		name: z.string().trim().min(1, 'Enter a tax name.').max(120, 'Use 120 characters or fewer.'),
		rate: taxRateSchema,
		scope: z.enum(taxScopes, { message: 'Choose a scope.' }),
		inputAccountId: optionalAccountId,
		outputAccountId: optionalAccountId
	})
	.superRefine((input, context) => {
		for (const requirement of TAX_REQUIREMENTS[input.scope]) {
			if (input[requirement.field] === null) {
				context.addIssue({
					code: 'custom',
					path: [requirement.field],
					message: `${TAX_SCOPE_LABELS[input.scope]} taxes require an ${requirement.label.toLowerCase()}.`
				})
			}
		}
	})

export type TaxInput = z.output<typeof taxInputSchema>

export const taxListQuerySchema = z.object({
	search: z.string().trim().max(160).default(''),
	scope: z.enum([...taxScopes, 'ALL']).default('ALL'),
	includeArchived: z.boolean().default(false),
	sort: z.enum(taxSortColumns).default('name'),
	direction: z.enum(['asc', 'desc']).default('asc'),
	page: z.coerce.number().int().min(1).catch(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export type TaxListQuery = z.input<typeof taxListQuerySchema>

export type TaxAccountRef = { id: string; code: string; name: string }

export type TaxSummary = {
	id: string
	name: string
	rate: string
	scope: TaxScope
	archivedAt: string | null
	revision: number
	inputAccount: TaxAccountRef | null
	outputAccount: TaxAccountRef | null
}
