import { z } from 'zod'

export const vendorBillStates = ['DRAFT', 'POSTED', 'CANCELLED'] as const

const canonicalMoneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
const canonicalQuantitySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)
const canonicalRateSchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)

const billDatesSchema = z.object({
	billDate: z.iso.date(),
	dueDate: z.iso.date()
})

export const createVendorBillInputSchema = billDatesSchema
	.extend({
		operationKey: z.uuid(),
		purchaseOrderId: z.uuid(),
		expectedPurchaseOrderRevision: z.number().int().positive(),
		vendorReference: z.string().trim().min(1).max(160).nullable().optional()
	})
	.refine((input) => input.dueDate >= input.billDate, {
		message: 'The due date cannot be before the bill date.',
		path: ['dueDate']
	})

export const updateVendorBillLineInputSchema = z.object({
	lineId: z.uuid(),
	taxId: z.uuid().nullable(),
	analyticAccountId: z.uuid().nullable()
})

export const updateDraftVendorBillInputSchema = billDatesSchema
	.extend({
		vendorBillId: z.uuid(),
		expectedRevision: z.number().int().positive(),
		vendorReference: z.string().trim().min(1).max(160).nullable().optional(),
		lines: z.array(updateVendorBillLineInputSchema).min(1).max(100)
	})
	.refine((input) => input.dueDate >= input.billDate, {
		message: 'The due date cannot be before the bill date.',
		path: ['dueDate']
	})

export const vendorBillTransitionInputSchema = z.object({
	operationKey: z.uuid(),
	vendorBillId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const postVendorBillInputSchema = vendorBillTransitionInputSchema.extend({
	journalId: z.uuid()
})

export const getVendorBillInputSchema = z.object({ vendorBillId: z.uuid() })

export const vendorBillListInputSchema = z.object({
	state: z.enum([...vendorBillStates, 'ALL']).default('ALL'),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export const vendorBillLineSchema = z.object({
	id: z.uuid(),
	position: z.number().int().nonnegative(),
	sourceOrderLineId: z.uuid(),
	productId: z.uuid(),
	productName: z.string(),
	quantity: canonicalQuantitySchema,
	unitPrice: canonicalRateSchema,
	lineNetTotal: canonicalMoneySchema,
	tax: z
		.object({
			id: z.uuid(),
			name: z.string(),
			rate: canonicalRateSchema
		})
		.nullable(),
	taxAmount: canonicalMoneySchema,
	lineTotal: canonicalMoneySchema,
	analyticAccount: z.object({ id: z.uuid(), name: z.string() }).nullable()
})

export const vendorBillDetailSchema = z.object({
	id: z.uuid(),
	billNumber: z.string(),
	billDate: z.iso.date(),
	dueDate: z.iso.date(),
	vendorReference: z.string().nullable(),
	state: z.enum(vendorBillStates),
	netTotal: canonicalMoneySchema,
	taxTotal: canonicalMoneySchema,
	total: canonicalMoneySchema,
	revision: z.number().int().positive(),
	vendor: z.object({ id: z.uuid(), name: z.string() }),
	sourceOrder: z.object({ id: z.uuid(), orderNumber: z.string() }),
	journalEntry: z.object({ id: z.uuid(), reference: z.string() }).nullable(),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	lines: z.array(vendorBillLineSchema)
})

export const vendorBillSummarySchema = vendorBillDetailSchema.omit({ lines: true })

export type VendorBillState = (typeof vendorBillStates)[number]
export type CreateVendorBillInput = z.input<typeof createVendorBillInputSchema>
export type UpdateDraftVendorBillInput = z.input<typeof updateDraftVendorBillInputSchema>
export type VendorBillTransitionInput = z.input<typeof vendorBillTransitionInputSchema>
export type PostVendorBillInput = z.input<typeof postVendorBillInputSchema>
export type GetVendorBillInput = z.input<typeof getVendorBillInputSchema>
export type VendorBillListInput = z.input<typeof vendorBillListInputSchema>
export type VendorBillDetail = z.output<typeof vendorBillDetailSchema>
export type VendorBillSummary = z.output<typeof vendorBillSummarySchema>

export type VendorBillListResult = {
	rows: VendorBillSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type VendorBillOptions = {
	purchaseJournals: Array<{ id: string; code: string; name: string }>
	taxes: Array<{ id: string; name: string; rate: string }>
	expenseAnalyticAccounts: Array<{ id: string; name: string }>
}
