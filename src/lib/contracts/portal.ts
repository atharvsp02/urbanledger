import { z } from 'zod'

export const portalListInputSchema = z.object({
	asOfDate: z.iso.date().optional(),
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export const portalDocumentInputSchema = z.object({
	documentId: z.uuid(),
	asOfDate: z.iso.date().optional()
})

export const portalPaymentInputSchema = z.object({ paymentId: z.uuid() })

export const contactDocumentSummaryInputSchema = z.object({
	contactId: z.uuid().optional(),
	asOfDate: z.iso.date().optional()
})

export type PortalListInput = z.input<typeof portalListInputSchema>
export type PortalDocumentInput = z.input<typeof portalDocumentInputSchema>
export type PortalPaymentInput = z.input<typeof portalPaymentInputSchema>
export type ContactDocumentSummaryInput = z.input<typeof contactDocumentSummaryInputSchema>

export type PortalSettlementStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REVERSED'

export type PortalDocumentSummary = {
	id: string
	kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL'
	number: string
	documentDate: string
	dueDate: string
	reference: string | null
	contact: { id: string; name: string }
	netTotal: string
	taxTotal: string
	total: string
	status: PortalSettlementStatus
	paidAmount: string
	outstandingAmount: string
	overdueAmount: string
}

export type PortalDocumentLine = {
	id: string
	productId: string
	productName: string
	quantity: string
	unitPrice: string
	netTotal: string
	taxName: string | null
	taxRate: string | null
	taxAmount: string
	total: string
}

export type PortalDocumentDetail = PortalDocumentSummary & {
	sourceOrder: { id: string; number: string }
	lines: PortalDocumentLine[]
}

export type PortalDocumentList = {
	rows: PortalDocumentSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type PortalPaymentSummary = {
	id: string
	number: string
	direction: 'CUSTOMER_INCOMING' | 'VENDOR_OUTGOING'
	status: 'POSTED' | 'REVERSED'
	paymentDate: string
	amount: string
	reference: string | null
	contact: { id: string; name: string }
	reversalDate: string | null
}

export type PortalPaymentDetail = PortalPaymentSummary & {
	allocations: Array<{
		id: string
		document: { id: string; kind: 'CUSTOMER_INVOICE' | 'VENDOR_BILL'; number: string }
		amount: string
		effectiveDate: string
		reversedAmount: string
		reversalDate: string | null
	}>
}

export type PortalPaymentList = {
	rows: PortalPaymentSummary[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type InvoicePrintData = PortalDocumentDetail & {
	business: {
		name: string
		addressLines: string[]
		currency: string
	}
}

export type PaymentReceiptData = PortalPaymentDetail & {
	business: { name: string; addressLines: string[]; currency: string }
}

export type ContactDocumentSummaries = {
	contact: { id: string; name: string }
	orders: Array<{
		id: string
		kind: 'PURCHASE' | 'SALES'
		number: string
		date: string
		state: 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
		total: string
	}>
	documents: PortalDocumentSummary[]
	payments: PortalPaymentSummary[]
}
