import { z } from 'zod'
import { purchaseQuantitySchema, purchaseUnitPriceSchema } from '@/lib/contracts/purchase-order'

export const salesOrderStates = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const

const salesOrderLineInputSchema = z.object({
	productId: z.uuid(),
	quantity: purchaseQuantitySchema,
	unitPrice: purchaseUnitPriceSchema,
	taxId: z.uuid().nullable().optional(),
	analyticAccountId: z.uuid().nullable().optional()
})

const salesOrderCommercialInputSchema = z.object({
	customerId: z.uuid(),
	orderDate: z.iso.date(),
	lines: z.array(salesOrderLineInputSchema).min(1).max(100)
})

export const createSalesOrderInputSchema = salesOrderCommercialInputSchema.extend({
	operationKey: z.uuid()
})

export const updateDraftSalesOrderInputSchema = salesOrderCommercialInputSchema.extend({
	salesOrderId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const salesOrderTransitionInputSchema = z.object({
	operationKey: z.uuid(),
	salesOrderId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const getSalesOrderInputSchema = z.object({ salesOrderId: z.uuid() })

export const salesOrderListInputSchema = z.object({
	state: z.enum([...salesOrderStates, 'ALL']).default('ALL'),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

const canonicalQuantitySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)
const canonicalMoneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
const canonicalRateSchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)

export const salesOrderLineSchema = z.object({
	id: z.uuid(),
	position: z.number().int().nonnegative(),
	productId: z.uuid(),
	productName: z.string(),
	productKind: z.enum(['GOODS', 'SERVICE', 'COMBO']),
	quantity: canonicalQuantitySchema,
	unitPrice: canonicalRateSchema,
	lineNetTotal: canonicalMoneySchema,
	tax: z.object({ id: z.uuid(), name: z.string(), rate: canonicalRateSchema }).nullable(),
	taxAmount: canonicalMoneySchema,
	grossTotal: canonicalMoneySchema,
	analyticAccount: z.object({ id: z.uuid(), name: z.string() }).nullable()
})

export const salesOrderDetailSchema = z.object({
	id: z.uuid(),
	kind: z.literal('SALES'),
	orderNumber: z.string(),
	orderDate: z.iso.date(),
	state: z.enum(salesOrderStates),
	netTotal: canonicalMoneySchema,
	taxTotal: canonicalMoneySchema,
	total: canonicalMoneySchema,
	revision: z.number().int().positive(),
	customer: z.object({ id: z.uuid(), name: z.string() }),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	// Defaults keep results stored by earlier operations parseable on replay.
	delivery: z
		.object({ id: z.uuid(), deliveryNumber: z.string(), deliveryDate: z.iso.date() })
		.nullable()
		.default(null),
	customerInvoice: z
		.object({
			id: z.uuid(),
			invoiceNumber: z.string(),
			state: z.enum(['DRAFT', 'POSTED', 'CANCELLED'])
		})
		.nullable()
		.default(null),
	lines: z.array(salesOrderLineSchema)
})

export type CreateSalesOrderInput = z.input<typeof createSalesOrderInputSchema>
export type UpdateDraftSalesOrderInput = z.input<typeof updateDraftSalesOrderInputSchema>
export type SalesOrderTransitionInput = z.input<typeof salesOrderTransitionInputSchema>
export type GetSalesOrderInput = z.input<typeof getSalesOrderInputSchema>
export type SalesOrderListInput = z.input<typeof salesOrderListInputSchema>
export type SalesOrderDetail = z.output<typeof salesOrderDetailSchema>
export type SalesOrderSummary = Omit<SalesOrderDetail, 'lines' | 'delivery' | 'customerInvoice'>

export type SalesOrderListResult = {
	rows: SalesOrderSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type SalesOrderOptions = {
	customers: Array<{ id: string; name: string; kind: 'CUSTOMER' | 'BOTH' }>
	products: Array<{
		id: string
		name: string
		kind: 'GOODS' | 'SERVICE' | 'COMBO'
		salesPrice: string
	}>
	taxes: Array<{ id: string; name: string; rate: string }>
	incomeAnalyticAccounts: Array<{ id: string; name: string }>
}
