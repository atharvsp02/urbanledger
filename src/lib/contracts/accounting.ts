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

export type ManualJournalInput = z.input<typeof manualJournalInputSchema>
export type OpeningJournalInput = z.input<typeof openingJournalInputSchema>
export type ReverseJournalInput = z.input<typeof reverseJournalInputSchema>
export type JournalPostingResult = z.output<typeof journalPostingResultSchema>
export type TrialBalanceInput = z.input<typeof trialBalanceInputSchema>

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
