import { z } from 'zod'

export const purchaseOrderStates = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const
export type PurchaseOrderState = (typeof purchaseOrderStates)[number]

export const purchaseQuantitySchema = z
	.string()
	.trim()
	.regex(/^(?:0|[1-9]\d{0,3})(?:\.\d{1,4})?$/, 'Enter a quantity with up to four decimals.')
	.refine((value) => /[1-9]/.test(value), 'Quantity must be greater than zero.')

export const purchaseUnitPriceSchema = z
	.string()
	.trim()
	.regex(
		/^(?:0|[1-9]\d{0,10})(?:\.\d{1,4})?$/,
		'Enter a non-negative unit price with up to four decimals.'
	)

const purchaseOrderLineInputSchema = z.object({
	productId: z.uuid(),
	quantity: purchaseQuantitySchema,
	unitPrice: purchaseUnitPriceSchema
})

const purchaseOrderCommercialInputSchema = z.object({
	vendorId: z.uuid(),
	orderDate: z.iso.date(),
	lines: z
		.array(purchaseOrderLineInputSchema)
		.min(1, 'Add at least one product line.')
		.max(100, 'A purchase order cannot contain more than 100 lines.')
})

export const createPurchaseOrderInputSchema = purchaseOrderCommercialInputSchema.extend({
	operationKey: z.uuid()
})

export const updateDraftPurchaseOrderInputSchema = purchaseOrderCommercialInputSchema.extend({
	purchaseOrderId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const purchaseOrderTransitionInputSchema = z.object({
	operationKey: z.uuid(),
	purchaseOrderId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const getPurchaseOrderInputSchema = z.object({ purchaseOrderId: z.uuid() })

export const purchaseOrderListInputSchema = z.object({
	state: z.enum([...purchaseOrderStates, 'ALL']).default('ALL'),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

const canonicalQuantitySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)
const canonicalMoneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
const canonicalUnitPriceSchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)

export const purchaseOrderLineSchema = z.object({
	id: z.uuid(),
	position: z.number().int().nonnegative(),
	productId: z.uuid(),
	productName: z.string(),
	quantity: canonicalQuantitySchema,
	unitPrice: canonicalUnitPriceSchema,
	lineTotal: canonicalMoneySchema
})

export const purchaseOrderDetailSchema = z.object({
	id: z.uuid(),
	kind: z.literal('PURCHASE'),
	orderNumber: z.string(),
	orderDate: z.iso.date(),
	state: z.enum(purchaseOrderStates),
	total: canonicalMoneySchema,
	revision: z.number().int().positive(),
	vendor: z.object({ id: z.uuid(), name: z.string() }),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	// Defaults keep results stored by earlier operations parseable on replay.
	receipt: z
		.object({ id: z.uuid(), receiptNumber: z.string(), receiptDate: z.iso.date() })
		.nullable()
		.default(null),
	vendorBill: z
		.object({
			id: z.uuid(),
			billNumber: z.string(),
			state: z.enum(['DRAFT', 'POSTED', 'CANCELLED'])
		})
		.nullable()
		.default(null),
	lines: z.array(purchaseOrderLineSchema)
})

export type CreatePurchaseOrderInput = z.input<typeof createPurchaseOrderInputSchema>
export type UpdateDraftPurchaseOrderInput = z.input<typeof updateDraftPurchaseOrderInputSchema>
export type PurchaseOrderTransitionInput = z.input<typeof purchaseOrderTransitionInputSchema>
export type GetPurchaseOrderInput = z.input<typeof getPurchaseOrderInputSchema>
export type PurchaseOrderListInput = z.input<typeof purchaseOrderListInputSchema>
export type PurchaseOrderDetail = z.output<typeof purchaseOrderDetailSchema>
export type PurchaseOrderLine = z.output<typeof purchaseOrderLineSchema>
export type PurchaseOrderSummary = Omit<PurchaseOrderDetail, 'lines' | 'receipt' | 'vendorBill'>

export type PurchaseOrderListResult = {
	rows: PurchaseOrderSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}
