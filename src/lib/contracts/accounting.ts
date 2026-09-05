import { z } from 'zod'

export const journalAmountSchema = z
	.string()
	.trim()
	.regex(
		/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/,
		'Enter a non-negative decimal amount with at most two decimal places.'
	)

const canonicalJournalAmountSchema = z
	.string()
	.regex(/^(?:0|[1-9]\d{0,17})\.\d{2}$/, 'Expected a canonical two-decimal amount.')

export const journalLineInputSchema = z.object({
	accountId: z.uuid(),
	contactId: z.uuid().nullable().optional(),
	analyticAccountId: z.uuid().nullable().optional(),
	description: z.string().trim().min(1).max(240).nullable().optional(),
	debit: journalAmountSchema.optional().default('0'),
	credit: journalAmountSchema.optional().default('0')
})

const journalPostingInputSchema = z.object({
	operationKey: z.uuid(),
	journalId: z.uuid(),
	postingDate: z.iso.date(),
	memo: z.string().trim().min(1).max(160),
	lines: z
		.array(journalLineInputSchema)
		.min(2, 'A journal entry requires at least two lines.')
		.max(100, 'A journal entry cannot contain more than 100 lines.')
})

export const manualJournalInputSchema = journalPostingInputSchema
export const openingJournalInputSchema = journalPostingInputSchema

export const reverseJournalInputSchema = z.object({
	operationKey: z.uuid(),
	entryId: z.uuid(),
	postingDate: z.iso.date(),
	reason: z.string().trim().min(3).max(240)
})

export const journalPostingResultSchema = z.object({
	entryId: z.uuid(),
	entryNumber: z.string().min(1),
	postingDate: z.iso.date(),
	source: z.enum(['MANUAL', 'OPENING', 'REVERSAL']),
	reversalOfEntryId: z.uuid().nullable(),
	totalDebit: canonicalJournalAmountSchema,
	totalCredit: canonicalJournalAmountSchema
})

export const trialBalanceInputSchema = z.object({ asOfDate: z.iso.date() })

export const journalEntrySources = [
	'OPENING',
	'MANUAL',
	'CUSTOMER_INVOICE',
	'VENDOR_BILL',
	'CUSTOMER_PAYMENT',
	'VENDOR_PAYMENT',
	'REVERSAL'
] as const

export const journalEntryListInputSchema = z
	.object({
		journalId: z.uuid().optional(),
		source: z.enum([...journalEntrySources, 'ALL']).default('ALL'),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		page: z.number().int().positive().default(1),
		pageSize: z.number().int().min(1).max(100).default(20)
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const journalEntryDetailInputSchema = z.object({ entryId: z.uuid() })

export const accountActivityInputSchema = z
	.object({
		accountId: z.uuid(),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		page: z.number().int().positive().default(1),
		pageSize: z.number().int().min(1).max(100).default(20)
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const journalActivityInputSchema = z
	.object({
		journalId: z.uuid(),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		page: z.number().int().positive().default(1),
		pageSize: z.number().int().min(1).max(100).default(20)
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const journalPostingOptionsInputSchema = z.object({
	source: z.enum(['MANUAL', 'OPENING', 'ALL']).default('ALL')
})

export type ManualJournalInput = z.input<typeof manualJournalInputSchema>
export type OpeningJournalInput = z.input<typeof openingJournalInputSchema>
export type ReverseJournalInput = z.input<typeof reverseJournalInputSchema>
export type JournalPostingResult = z.output<typeof journalPostingResultSchema>
export type TrialBalanceInput = z.input<typeof trialBalanceInputSchema>
export type JournalEntrySource = (typeof journalEntrySources)[number]
export type JournalEntryState = 'DRAFT' | 'POSTED'
export type JournalEntryStatus = JournalEntryState | 'REVERSED' | 'REVERSAL'
export type JournalEntryListInput = z.input<typeof journalEntryListInputSchema>
export type JournalEntryDetailInput = z.input<typeof journalEntryDetailInputSchema>
export type AccountActivityInput = z.input<typeof accountActivityInputSchema>
export type JournalActivityInput = z.input<typeof journalActivityInputSchema>
export type JournalPostingOptionsInput = z.input<typeof journalPostingOptionsInputSchema>

export type AccountingAccountRef = {
	id: string
	code: string
	name: string
}

export type AccountingJournalRef = {
	id: string
	code: string
	name: string
	type: 'SALES' | 'PURCHASE' | 'BANK' | 'CASH' | 'GENERAL' | 'OPENING'
}

export type JournalEntrySummary = {
	id: string
	reference: string
	postingDate: string
	source: JournalEntrySource
	state: JournalEntryState
	status: JournalEntryStatus
	journal: AccountingJournalRef
	totalDebit: string
	totalCredit: string
	lineCount: number
}

export type JournalEntryLine = {
	id: string
	account: AccountingAccountRef
	contact: { id: string; name: string } | null
	analyticAccount: { id: string; name: string } | null
	description: string | null
	debit: string
	credit: string
}

export type JournalEntryDetail = JournalEntrySummary & {
	sourceReference: string | null
	createdBy: { id: string; displayName: string }
	postedAt: string | null
	originalEntry: { id: string; reference: string } | null
	reversalEntry: { id: string; reference: string } | null
	lines: readonly JournalEntryLine[]
}

export type JournalEntryListResult = {
	rows: readonly JournalEntrySummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type BalanceDirection = 'DR' | 'CR' | 'ZERO'

export type AccountActivityRow = {
	itemId: string
	entryId: string
	postingDate: string
	journal: AccountingJournalRef
	reference: string
	source: JournalEntrySource
	description: string | null
	contact: { id: string; name: string } | null
	debit: string
	credit: string
}

export type AccountActivityResult = {
	account: AccountingAccountRef & {
		type: 'ASSET' | 'LIABILITY' | 'EXPENSE' | 'INCOME' | 'CAPITAL'
		subtype: 'GENERAL' | 'CASH' | 'BANK' | 'RECEIVABLE' | 'PAYABLE' | 'INPUT_TAX' | 'OUTPUT_TAX'
	}
	currentBalance: string
	direction: BalanceDirection
	totalDebit: string
	totalCredit: string
	rows: readonly AccountActivityRow[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type JournalActivityResult = {
	journal: AccountingJournalRef
	postedEntryCount: number
	totalDebit: string
	totalCredit: string
	rows: readonly JournalEntrySummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type JournalPostingOptions = {
	journals: readonly AccountingJournalRef[]
	accounts: readonly (AccountingAccountRef & {
		type: 'ASSET' | 'LIABILITY' | 'EXPENSE' | 'INCOME' | 'CAPITAL'
		subtype: 'GENERAL' | 'CASH' | 'BANK' | 'RECEIVABLE' | 'PAYABLE' | 'INPUT_TAX' | 'OUTPUT_TAX'
	})[]
	contacts: readonly { id: string; name: string }[]
	analyticAccounts: readonly { id: string; name: string; type: 'INCOME' | 'EXPENSE' }[]
}

export type TrialBalanceRow = {
	accountId: string
	accountCode: string
	accountName: string
	accountType: 'ASSET' | 'LIABILITY' | 'EXPENSE' | 'INCOME' | 'CAPITAL'
	debit: string
	credit: string
	balance: string
}

export type TrialBalanceResult = {
	businessId: string
	asOfDate: string
	generatedAt: string
	rows: TrialBalanceRow[]
	totalDebit: string
	totalCredit: string
	difference: string
	balanced: boolean
}
