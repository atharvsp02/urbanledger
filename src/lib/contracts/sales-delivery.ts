import { z } from 'zod'

const canonicalQuantitySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)
const signedQuantitySchema = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{4}$/)

export const deliverSalesOrderInputSchema = z.object({
	operationKey: z.uuid(),
	salesOrderId: z.uuid(),
	expectedRevision: z.number().int().positive(),
	deliveryDate: z.iso.date()
})

export const getSalesDeliveryInputSchema = z.object({ salesDeliveryId: z.uuid() })

const datedListFields = {
	dateFrom: z.iso.date().optional(),
	dateTo: z.iso.date().optional(),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
}

export const salesDeliveryListInputSchema = z
	.object(datedListFields)
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})
export const inventoryMovementListInputSchema = z
	.object({ ...datedListFields, productId: z.uuid().optional() })
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const salesDeliveryLineSchema = z.object({
	id: z.uuid(),
	position: z.number().int().nonnegative(),
	sourceOrderLineId: z.uuid(),
	productId: z.uuid(),
	productName: z.string(),
	productKind: z.enum(['GOODS', 'SERVICE', 'COMBO']),
	quantity: canonicalQuantitySchema,
	inventoryMovementId: z.uuid().nullable()
})

export const salesDeliveryDetailSchema = z.object({
	id: z.uuid(),
	deliveryNumber: z.string(),
	deliveryDate: z.iso.date(),
	sourceOrder: z.object({ id: z.uuid(), orderNumber: z.string(), orderDate: z.iso.date() }),
	customer: z.object({ id: z.uuid(), name: z.string() }),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	lines: z.array(salesDeliveryLineSchema)
})

export const inventoryMovementSchema = z.object({
	id: z.uuid(),
	movementDate: z.iso.date(),
	product: z.object({ id: z.uuid(), name: z.string() }),
	quantityChange: signedQuantitySchema,
	direction: z.enum(['IN', 'OUT']),
	sourceType: z.enum(['PURCHASE_RECEIPT', 'SALES_DELIVERY']),
	sourceId: z.uuid(),
	sourceNumber: z.string()
})

export type DeliverSalesOrderInput = z.input<typeof deliverSalesOrderInputSchema>
export type GetSalesDeliveryInput = z.input<typeof getSalesDeliveryInputSchema>
export type SalesDeliveryListInput = z.input<typeof salesDeliveryListInputSchema>
export type InventoryMovementListInput = z.input<typeof inventoryMovementListInputSchema>
export type SalesDeliveryDetail = z.output<typeof salesDeliveryDetailSchema>
export type SalesDeliverySummary = Omit<SalesDeliveryDetail, 'lines'>
export type InventoryMovement = z.output<typeof inventoryMovementSchema>

export type SalesDeliveryListResult = {
	rows: SalesDeliverySummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type InventoryMovementListResult = {
	rows: InventoryMovement[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}
