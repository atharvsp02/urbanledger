import { Suspense } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import {
	customerInvoiceStates,
	type CustomerInvoiceSummary
} from '@/lib/contracts/customer-invoice'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listCustomerInvoices } from '@/server/sales'
import { InvoiceStateBadge } from '@/app/(workspace)/sales/invoices/invoice-state-badge'

const PAGE_SIZE = 20

const STATE_LABELS: Record<(typeof customerInvoiceStates)[number], string> = {
	DRAFT: 'Draft',
	POSTED: 'Posted',
	CANCELLED: 'Cancelled'
}

type InvoiceParams = { state?: string; page?: string }

function buildHref(params: InvoiceParams, patch: InvoiceParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/sales/invoices' : `/sales/invoices?${queryString}`
}

async function InvoicesTable({ params }: { params: InvoiceParams }) {
	const actor = await getActor()
	const result = await listCustomerInvoices(actor, {
		state: (params.state as 'ALL') ?? 'ALL',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<CustomerInvoiceSummary>[] = [
		{ id: 'invoiceNumber', header: 'Invoice', cell: (invoice) => invoice.invoiceNumber },
		{ id: 'customer', header: 'Customer', cell: (invoice) => invoice.customer.name },
		{
			id: 'sourceOrder',
			header: 'Sales order',
			cell: (invoice) => (
				<Link
					href={`/sales/orders/${invoice.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{invoice.sourceOrder.orderNumber}
				</Link>
			)
		},
		{
			id: 'invoiceDate',
			header: 'Invoice date',
			cell: (invoice) => formatBusinessDate(invoice.invoiceDate)
		},
		{ id: 'dueDate', header: 'Due', cell: (invoice) => formatBusinessDate(invoice.dueDate) },
		{
			id: 'state',
			header: 'Status',
			cell: (invoice) => <InvoiceStateBadge state={invoice.state} />
		},
		{
			id: 'total',
			header: 'Total',
			isNumeric: true,
			cell: (invoice) => formatAmount(invoice.total)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Customer invoices"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(invoice) => invoice.id}
				getRowHref={(invoice) => `/sales/invoices/${invoice.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={FileText}
							title="No customer invoices match this filter"
							description="An invoice is generated from a confirmed sales order and reaches the ledger only when posted."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="invoices"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function CustomerInvoicesPage({
	searchParams
}: {
	searchParams: Promise<InvoiceParams>
}) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Customer invoices"
				lead="Generated from confirmed sales orders. Posting recognises revenue and the receivable."
			/>

			<ListToolbar
				action="/sales/invoices"
				hasSearch={false}
				searchLabel="Filter customer invoices"
				resetHref="/sales/invoices"
			>
				<ToolbarFilter
					label="Status"
					name="state"
					defaultValue={params.state ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All statuses' },
						...customerInvoiceStates.map((value) => ({ value, label: STATE_LABELS[value] }))
					]}
				/>
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={7} />}>
				<InvoicesTable params={params} />
			</Suspense>
		</>
	)
}
