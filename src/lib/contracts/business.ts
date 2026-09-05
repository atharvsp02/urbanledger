import { z } from 'zod'

const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable()
const prefixSchema = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z0-9][A-Z0-9/-]{0,11}$/, 'Use 1 to 12 uppercase letters, numbers, slash or hyphen.')
const positiveMoneySchema = z
	.string()
	.trim()
	.regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/)
	.refine((value) => /[1-9]/.test(value), 'Opening balance must be greater than zero.')
const moneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)

const businessSettingsFields = {
	name: z.string().trim().min(1).max(160),
	addressLine1: nullableText(240),
	addressLine2: nullableText(240),
	city: nullableText(100),
	state: nullableText(100),
	postalCode: nullableText(16),
	country: z.string().trim().min(1).max(100),
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/),
	timezone: z.string().trim().min(1).max(64),
	fiscalYearStartMonth: z.number().int().min(1).max(12),
	fiscalYearStartDay: z.number().int().min(1).max(31),
	purchaseOrderPrefix: prefixSchema,
	salesOrderPrefix: prefixSchema,
	purchaseReceiptPrefix: prefixSchema,
	salesDeliveryPrefix: prefixSchema,
	customerInvoicePrefix: prefixSchema,
	vendorBillPrefix: prefixSchema,
	customerPaymentPrefix: prefixSchema,
	vendorPaymentPrefix: prefixSchema,
	journalEntryPrefix: prefixSchema
} as const

export const businessSettingsSchema = z.object({
	id: z.uuid(),
	...businessSettingsFields,
	accountingLockDate: z.iso.date().nullable(),
	revision: z.number().int().positive(),
	setupCompletedAt: z.iso.datetime().nullable()
})

export const updateBusinessSettingsInputSchema = z.object({
	operationKey: z.uuid(),
	expectedRevision: z.number().int().positive(),
	...businessSettingsFields
})

export const updateAccountingLockDateInputSchema = z.object({
	operationKey: z.uuid(),
	expectedRevision: z.number().int().positive(),
	lockDate: z.iso.date().nullable()
})

export const completeBusinessSetupInputSchema = z.object({
	operationKey: z.uuid(),
	expectedRevision: z.number().int().positive(),
	openingDate: z.iso.date(),
	openingJournalId: z.uuid(),
	capitalAccountId: z.uuid(),
	balances: z
		.array(z.object({ accountId: z.uuid(), amount: positiveMoneySchema }))
		.max(2)
		.refine(
			(balances) => new Set(balances.map((balance) => balance.accountId)).size === balances.length,
			{
				message: 'Choose each opening liquidity account once.'
			}
		)
})

export const setupReadinessSchema = z.object({
	isReadyToPost: z.boolean(),
	isSetupComplete: z.boolean(),
	missingRequirements: z.array(z.string()),
	completedAt: z.iso.datetime().nullable()
})

export const openingBalanceOptionsSchema = z.object({
	openingJournals: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() })),
	liquidityAccounts: z.array(
		z.object({
			id: z.uuid(),
			code: z.string(),
			name: z.string(),
			subtype: z.enum(['CASH', 'BANK'])
		})
	),
	capitalAccounts: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string() }))
})

export const businessSetupResultSchema = z.object({
	settings: businessSettingsSchema,
	readiness: setupReadinessSchema,
	openingEntry: z
		.object({
			entryId: z.uuid(),
			entryNumber: z.string(),
			postingDate: z.iso.date(),
			total: moneySchema
		})
		.nullable()
})

export type BusinessSettings = z.output<typeof businessSettingsSchema>
export type UpdateBusinessSettingsInput = z.input<typeof updateBusinessSettingsInputSchema>
export type UpdateAccountingLockDateInput = z.input<typeof updateAccountingLockDateInputSchema>
export type CompleteBusinessSetupInput = z.input<typeof completeBusinessSetupInputSchema>
export type SetupReadiness = z.output<typeof setupReadinessSchema>
export type OpeningBalanceOptions = z.output<typeof openingBalanceOptionsSchema>
export type BusinessSetupResult = z.output<typeof businessSetupResultSchema>
