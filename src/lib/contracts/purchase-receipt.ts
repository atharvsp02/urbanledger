import { z } from 'zod'

const canonicalQuantitySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)

export const receivePurchaseOrderInputSchema = z.object({
	operationKey: z.uuid(),
	purchaseOrderId: z.uuid(),
	expectedRevision: z.number().int().positive(),
	receiptDate: z.iso.date()
})

export const getPurchaseReceiptInputSchema = z.object({ purchaseReceiptId: z.uuid() })

export const purchaseReceiptListInputSchema = z
	.object({
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		page: z.number().int().positive().default(1),
		pageSize: z.number().int().min(1).max(100).default(20)
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const inventoryPositionInputSchema = z.object({
	productId: z.uuid().optional(),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export const purchaseReceiptLineSchema = z.object({
	id: z.uuid(),
	position: z.number().int().nonnegative(),
	sourceOrderLineId: z.uuid(),
	productId: z.uuid(),
	productName: z.string(),
	productKind: z.enum(['GOODS', 'SERVICE', 'COMBO']),
	quantity: canonicalQuantitySchema,
	inventoryMovementId: z.uuid().nullable()
})

export const purchaseReceiptDetailSchema = z.object({
	id: z.uuid(),
	receiptNumber: z.string(),
	receiptDate: z.iso.date(),
	sourceOrder: z.object({
		id: z.uuid(),
		orderNumber: z.string(),
		orderDate: z.iso.date()
	}),
	vendor: z.object({ id: z.uuid(), name: z.string() }),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	lines: z.array(purchaseReceiptLineSchema)
})

export const purchaseReceiptSummarySchema = purchaseReceiptDetailSchema.omit({ lines: true })

export const inventoryPositionSchema = z.object({
	productId: z.uuid(),
	productName: z.string(),
	productKind: z.enum(['GOODS', 'COMBO']),
	quantityOnHand: canonicalQuantitySchema
})

export type ReceivePurchaseOrderInput = z.input<typeof receivePurchaseOrderInputSchema>
export type GetPurchaseReceiptInput = z.input<typeof getPurchaseReceiptInputSchema>
export type PurchaseReceiptListInput = z.input<typeof purchaseReceiptListInputSchema>
export type InventoryPositionInput = z.input<typeof inventoryPositionInputSchema>
export type PurchaseReceiptDetail = z.output<typeof purchaseReceiptDetailSchema>
export type PurchaseReceiptSummary = z.output<typeof purchaseReceiptSummarySchema>
export type InventoryPosition = z.output<typeof inventoryPositionSchema>

export type PurchaseReceiptListResult = {
	rows: PurchaseReceiptSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type InventoryPositionResult = {
	rows: InventoryPosition[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}
