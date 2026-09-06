import { FileText } from 'lucide-react'
import { WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { ContactDocumentSummaries } from '@/lib/contracts/portal'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getContactDocumentSummaries } from '@/server/portal'
import {
	PaymentDirectionBadge,
	PaymentStatusBadge,
	SettlementBadge
} from '@/app/(workspace)/payments/payment-presentation'

type Order = ContactDocumentSummaries['orders'][number]
type Document = ContactDocumentSummaries['documents'][number]
type Payment = ContactDocumentSummaries['payments'][number]

function orderHref(order: Order) {
	return order.kind === 'SALES' ? `/sales/orders/${order.id}` : `/purchases/orders/${order.id}`
}

function documentHref(document: Document) {
	return document.kind === 'CUSTOMER_INVOICE'
		? `/sales/invoices/${document.id}`
		: `/purchases/bills/${document.id}`
}

const ORDER_COLUMNS: readonly TableColumn<Order>[] = [
	{ id: 'number', header: 'Number', cell: (order) => order.number },
	{
		id: 'kind',
		header: 'Type',
		cell: (order) => <Badge>{order.kind === 'SALES' ? 'Sales order' : 'Purchase order'}</Badge>
	},
	{ id: 'date', header: 'Date', cell: (order) => formatBusinessDate(order.date) },
	{
		id: 'state',
		header: 'Status',
		cell: (order) => (
			<Badge
				tone={
					order.state === 'CONFIRMED'
						? 'success'
						: order.state === 'CANCELLED'
							? 'danger'
							: 'neutral'
				}
			>
				{order.state === 'CONFIRMED'
					? 'Confirmed'
					: order.state === 'CANCELLED'
						? 'Cancelled'
						: 'Draft'}
			</Badge>
		)
	},
	{ id: 'total', header: 'Total', isNumeric: true, cell: (order) => formatAmount(order.total) }
]

const DOCUMENT_COLUMNS: readonly TableColumn<Document>[] = [
	{ id: 'number', header: 'Number', cell: (document) => document.number },
	{
		id: 'kind',
		header: 'Type',
		cell: (document) => (
			<Badge>{document.kind === 'CUSTOMER_INVOICE' ? 'Invoice' : 'Vendor bill'}</Badge>
		)
	},
	{ id: 'date', header: 'Date', cell: (document) => formatBusinessDate(document.documentDate) },
	{ id: 'due', header: 'Due', cell: (document) => formatBusinessDate(document.dueDate) },
	{
		id: 'status',
		header: 'Status',
		cell: (document) => (
			<SettlementBadge status={document.status} isOverdue={document.overdueAmount !== '0.00'} />
		)
	},
	{
		id: 'total',
		header: 'Total',
		isNumeric: true,
		cell: (document) => formatAmount(document.total)
	},
	{
		id: 'outstanding',
		header: 'Outstanding',
		isNumeric: true,
		cell: (document) => formatAmount(document.outstandingAmount)
	}
]

const PAYMENT_COLUMNS: readonly TableColumn<Payment>[] = [
	{ id: 'number', header: 'Number', cell: (payment) => payment.number },
	{
		id: 'direction',
		header: 'Direction',
		cell: (payment) => <PaymentDirectionBadge direction={payment.direction} />
	},
	{ id: 'date', header: 'Date', cell: (payment) => formatBusinessDate(payment.paymentDate) },
	{
		id: 'status',
		header: 'Status',
		cell: (payment) => <PaymentStatusBadge status={payment.status} />
	},
	{
		id: 'amount',
		header: 'Amount',
		isNumeric: true,
		cell: (payment) => formatAmount(payment.amount)
	}
]

export async function ContactDocuments({ contactId }: { contactId: string }) {
	const actor = await getActor()

	if (!actor.capabilities.includes('transactions:read')) return null

	const result = await getContactDocumentSummaries(actor, { contactId })

	if (!result.ok) {
		return (
			<WorkSurface title="Related documents">
				<ErrorState description={result.error.message} />
			</WorkSurface>
		)
	}

	const { orders, documents, payments } = result.data
	const isEmpty = orders.length === 0 && documents.length === 0 && payments.length === 0

	if (isEmpty) {
		return (
			<WorkSurface title="Related documents">
				<EmptyState
					icon={FileText}
					title="No documents yet"
					description="Orders, invoices, bills and payments for this contact appear here."
				/>
			</WorkSurface>
		)
	}

	return (
		<WorkSurface
			title="Related documents"
			description="Every row opens the source document it was created from."
		>
			<div className="space-y-6">
				{orders.length > 0 && (
					<section className="space-y-2">
						<h3 className="text-sm font-semibold">Orders</h3>
						<DataTable
							caption="Orders for this contact"
							columns={ORDER_COLUMNS}
							rows={orders}
							getRowKey={(order) => order.id}
							getRowHref={orderHref}
						/>
					</section>
				)}

				{documents.length > 0 && (
					<section className="space-y-2">
						<h3 className="text-sm font-semibold">Invoices and bills</h3>
						<DataTable
							caption="Invoices and bills for this contact"
							columns={DOCUMENT_COLUMNS}
							rows={documents}
							getRowKey={(document) => document.id}
							getRowHref={documentHref}
						/>
					</section>
				)}

				{payments.length > 0 && (
					<section className="space-y-2">
						<h3 className="text-sm font-semibold">Payments</h3>
						<DataTable
							caption="Payments for this contact"
							columns={PAYMENT_COLUMNS}
							rows={payments}
							getRowKey={(payment) => payment.id}
							getRowHref={(payment) => `/payments/${payment.id}`}
						/>
					</section>
				)}
			</div>
		</WorkSurface>
	)
}
