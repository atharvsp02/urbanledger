import { z } from 'zod'

export const customerInvoiceStates = ['DRAFT', 'POSTED', 'CANCELLED'] as const

const invoiceDatesSchema = z.object({
	invoiceDate: z.iso.date(),
	dueDate: z.iso.date()
})

export const createCustomerInvoiceInputSchema = invoiceDatesSchema
	.extend({
		operationKey: z.uuid(),
		salesOrderId: z.uuid(),
		expectedSalesOrderRevision: z.number().int().positive(),
		reference: z.string().trim().min(1).max(160).nullable().optional()
	})
	.refine((input) => input.dueDate >= input.invoiceDate, {
		message: 'The due date cannot be before the invoice date.',
		path: ['dueDate']
	})

export const updateDraftCustomerInvoiceInputSchema = invoiceDatesSchema
	.extend({
		customerInvoiceId: z.uuid(),
		expectedRevision: z.number().int().positive(),
		reference: z.string().trim().min(1).max(160).nullable().optional()
	})
	.refine((input) => input.dueDate >= input.invoiceDate, {
		message: 'The due date cannot be before the invoice date.',
		path: ['dueDate']
	})

export const customerInvoiceTransitionInputSchema = z.object({
	operationKey: z.uuid(),
	customerInvoiceId: z.uuid(),
	expectedRevision: z.number().int().positive()
})

export const postCustomerInvoiceInputSchema = customerInvoiceTransitionInputSchema.extend({
	journalId: z.uuid()
})

export const getCustomerInvoiceInputSchema = z.object({ customerInvoiceId: z.uuid() })

export const customerInvoiceListInputSchema = z.object({
	state: z.enum([...customerInvoiceStates, 'ALL']).default('ALL'),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

const canonicalMoneySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{2}$/)
const canonicalQuantitySchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)
const canonicalRateSchema = z.string().regex(/^(?:0|[1-9]\d*)\.\d{4}$/)

export const customerInvoiceLineSchema = z.object({
	id: z.uuid(),
	position: z.number().int().nonnegative(),
	sourceOrderLineId: z.uuid(),
	productId: z.uuid(),
	productName: z.string(),
	quantity: canonicalQuantitySchema,
	unitPrice: canonicalRateSchema,
	lineNetTotal: canonicalMoneySchema,
	tax: z.object({ id: z.uuid(), name: z.string(), rate: canonicalRateSchema }).nullable(),
	taxAmount: canonicalMoneySchema,
	lineTotal: canonicalMoneySchema,
	analyticAccount: z.object({ id: z.uuid(), name: z.string() }).nullable()
})

export const customerInvoiceDetailSchema = z.object({
	id: z.uuid(),
	invoiceNumber: z.string(),
	invoiceDate: z.iso.date(),
	dueDate: z.iso.date(),
	reference: z.string().nullable(),
	state: z.enum(customerInvoiceStates),
	netTotal: canonicalMoneySchema,
	taxTotal: canonicalMoneySchema,
	total: canonicalMoneySchema,
	revision: z.number().int().positive(),
	customer: z.object({ id: z.uuid(), name: z.string() }),
	sourceOrder: z.object({ id: z.uuid(), orderNumber: z.string() }),
	journalEntry: z.object({ id: z.uuid(), reference: z.string() }).nullable(),
	createdBy: z.object({ id: z.uuid(), displayName: z.string() }),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	lines: z.array(customerInvoiceLineSchema)
})

export type CreateCustomerInvoiceInput = z.input<typeof createCustomerInvoiceInputSchema>
export type UpdateDraftCustomerInvoiceInput = z.input<typeof updateDraftCustomerInvoiceInputSchema>
export type CustomerInvoiceTransitionInput = z.input<typeof customerInvoiceTransitionInputSchema>
export type PostCustomerInvoiceInput = z.input<typeof postCustomerInvoiceInputSchema>
export type GetCustomerInvoiceInput = z.input<typeof getCustomerInvoiceInputSchema>
export type CustomerInvoiceListInput = z.input<typeof customerInvoiceListInputSchema>
export type CustomerInvoiceDetail = z.output<typeof customerInvoiceDetailSchema>
export type CustomerInvoiceSummary = Omit<CustomerInvoiceDetail, 'lines'>

export type CustomerInvoiceListResult = {
	rows: CustomerInvoiceSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type CustomerInvoiceOptions = {
	salesJournals: Array<{ id: string; code: string; name: string }>
}
