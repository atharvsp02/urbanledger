import { z } from 'zod'

const moneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
const positiveMoneyInputSchema = z
	.string()
	.trim()
	.regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'Enter a positive amount with up to two decimals.')
	.refine((value) => /[1-9]/.test(value), 'Amount must be greater than zero.')

export const paymentDirections = ['CUSTOMER_INCOMING', 'VENDOR_OUTGOING'] as const
export const paymentStatuses = ['POSTED', 'REVERSED'] as const
export const settlementStatuses = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REVERSED'] as const
export const paymentAttemptStatuses = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const

const recordPaymentBaseSchema = z.object({
	operationKey: z.uuid(),
	documentId: z.uuid(),
	expectedDocumentRevision: z.number().int().positive(),
	journalId: z.uuid(),
	paymentDate: z.iso.date(),
	amount: positiveMoneyInputSchema,
	reference: z.string().trim().min(1).max(160).nullable().optional()
})

export const recordCustomerPaymentInputSchema = recordPaymentBaseSchema
export const recordVendorPaymentInputSchema = recordPaymentBaseSchema

export const getPaymentOptionsInputSchema = z.object({ documentId: z.uuid() })
export const getPaymentInputSchema = z.object({ paymentId: z.uuid() })
export const getDocumentSettlementInputSchema = z.object({
	documentId: z.uuid(),
	asOfDate: z.iso.date().optional()
})
export const paymentListInputSchema = z
	.object({
		direction: z.enum([...paymentDirections, 'ALL']).default('ALL'),
		status: z.enum([...paymentStatuses, 'ALL']).default('ALL'),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		page: z.number().int().positive().default(1),
		pageSize: z.number().int().min(1).max(100).default(20)
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const reversePaymentInputSchema = z.object({
	operationKey: z.uuid(),
	paymentId: z.uuid(),
	expectedRevision: z.number().int().positive(),
	reversalDate: z.iso.date(),
	reason: z.string().trim().min(3).max(240)
})

export const reverseFinancialDocumentInputSchema = z.object({
	operationKey: z.uuid(),
	documentId: z.uuid(),
	expectedRevision: z.number().int().positive(),
	reversalDate: z.iso.date(),
	reason: z.string().trim().min(3).max(240)
})

export const createPortalPaymentAttemptInputSchema = z.object({
	operationKey: z.uuid(),
	documentId: z.uuid(),
	expectedDocumentRevision: z.number().int().positive(),
	paymentDate: z.iso.date(),
	amount: positiveMoneyInputSchema
})

export const finalizePortalPaymentAttemptInputSchema = z
	.object({
		operationKey: z.uuid(),
		attemptId: z.uuid(),
		expectedRevision: z.number().int().positive(),
		journalId: z.uuid().optional(),
		outcome: z.enum(['SUCCEEDED', 'FAILED'])
	})
	.refine((input) => input.outcome === 'FAILED' || input.journalId !== undefined, {
		message: 'Choose a payment journal for a successful payment.',
		path: ['journalId']
	})

export const cancelPortalPaymentAttemptInputSchema = z.object({
	operationKey: z.uuid(),
	attemptId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const getPortalPaymentAttemptStatusInputSchema = z.object({ attemptId: z.uuid() })

export const paymentAllocationSchema = z.object({
	id: z.uuid(),
	document: z.object({
		id: z.uuid(),
		kind: z.enum(['CUSTOMER_INVOICE', 'VENDOR_BILL']),
		number: z.string()
	}),
	amount: moneySchema,
	effectiveDate: z.iso.date(),
	reversal: z.object({ id: z.uuid(), amount: moneySchema, effectiveDate: z.iso.date() }).nullable()
})

export const paymentDetailSchema = z.object({
	id: z.uuid(),
	paymentNumber: z.string(),
	direction: z.enum(paymentDirections),
	sourceMode: z.enum(['STAFF', 'PORTAL_SIMULATION']),
	status: z.enum(paymentStatuses),
	paymentDate: z.iso.date(),
	amount: moneySchema,
	reference: z.string().nullable(),
	revision: z.number().int().positive(),
	contact: z.object({ id: z.uuid(), name: z.string() }),
	journal: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
	journalEntry: z.object({ id: z.uuid(), reference: z.string() }),
	reversalEntry: z.object({ id: z.uuid(), reference: z.string() }).nullable(),
	reversalDate: z.iso.date().nullable(),
	reversalReason: z.string().nullable(),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	allocations: z.array(paymentAllocationSchema)
})

export const paymentSummarySchema = paymentDetailSchema.omit({ allocations: true })

export const documentSettlementSchema = z.object({
	document: z.object({
		id: z.uuid(),
		kind: z.enum(['CUSTOMER_INVOICE', 'VENDOR_BILL']),
		number: z.string(),
		documentDate: z.iso.date(),
		dueDate: z.iso.date(),
		state: z.enum(['POSTED', 'REVERSED']),
		total: moneySchema,
		contact: z.object({ id: z.uuid(), name: z.string() })
	}),
	asOfDate: z.iso.date(),
	status: z.enum(settlementStatuses),
	allocatedAmount: moneySchema,
	reversedAllocationAmount: moneySchema,
	paidAmount: moneySchema,
	outstandingAmount: moneySchema,
	overdueAmount: moneySchema
})

export const paymentAttemptSchema = z.object({
	id: z.uuid(),
	document: z.object({ id: z.uuid(), number: z.string() }),
	status: z.enum(paymentAttemptStatuses),
	amount: moneySchema,
	paymentDate: z.iso.date(),
	revision: z.number().int().positive(),
	paymentId: z.uuid().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime()
})

export const financialDocumentReversalResultSchema = z.object({
	documentId: z.uuid(),
	documentKind: z.enum(['CUSTOMER_INVOICE', 'VENDOR_BILL']),
	documentNumber: z.string(),
	state: z.literal('REVERSED'),
	reversalEntry: z.object({ id: z.uuid(), reference: z.string(), postingDate: z.iso.date() }),
	reason: z.string()
})

export type RecordCustomerPaymentInput = z.input<typeof recordCustomerPaymentInputSchema>
export type RecordVendorPaymentInput = z.input<typeof recordVendorPaymentInputSchema>
export type GetPaymentOptionsInput = z.input<typeof getPaymentOptionsInputSchema>
export type GetPaymentInput = z.input<typeof getPaymentInputSchema>
export type GetDocumentSettlementInput = z.input<typeof getDocumentSettlementInputSchema>
export type PaymentListInput = z.input<typeof paymentListInputSchema>
export type ReversePaymentInput = z.input<typeof reversePaymentInputSchema>
export type ReverseFinancialDocumentInput = z.input<typeof reverseFinancialDocumentInputSchema>
export type CreatePortalPaymentAttemptInput = z.input<typeof createPortalPaymentAttemptInputSchema>
export type FinalizePortalPaymentAttemptInput = z.input<
	typeof finalizePortalPaymentAttemptInputSchema
>
export type CancelPortalPaymentAttemptInput = z.input<typeof cancelPortalPaymentAttemptInputSchema>
export type GetPortalPaymentAttemptStatusInput = z.input<
	typeof getPortalPaymentAttemptStatusInputSchema
>
export type PaymentDetail = z.output<typeof paymentDetailSchema>
export type PaymentSummary = z.output<typeof paymentSummarySchema>
export type DocumentSettlement = z.output<typeof documentSettlementSchema>
export type PaymentAttemptDetail = z.output<typeof paymentAttemptSchema>
export type FinancialDocumentReversalResult = z.output<typeof financialDocumentReversalResultSchema>

export type PaymentListResult = {
	rows: PaymentSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type PaymentOptions = {
	document: DocumentSettlement
	liquidityJournals: Array<{
		id: string
		code: string
		name: string
		type: 'BANK' | 'CASH'
	}>
}

export type DocumentPaymentHistory = {
	settlement: DocumentSettlement
	payments: PaymentSummary[]
}
