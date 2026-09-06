import Link from 'next/link'
import { FileText, Inbox, Wallet } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import { Pagination } from '@/components/ui/pagination'
import type { PortalDocumentSummary, PortalPaymentSummary } from '@/lib/contracts/portal'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import {
	listPortalCustomerInvoices,
	listPortalPayments,
	listPortalVendorBills
} from '@/server/portal'
import { PortalPaymentStatusBadge, PortalStatusBadge } from '@/app/portal/portal-presentation'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 10

type PortalParams = { invoicePage?: string; billPage?: string; paymentPage?: string }

function pageNumber(value?: string) {
	return Math.max(1, Number(value ?? '1') || 1)
}

function buildPortalHref(params: PortalParams, patch: PortalParams) {
	const query = new URLSearchParams()
	for (const [name, value] of Object.entries({ ...params, ...patch })) {
		if (value != null && value !== '' && value !== '1') query.set(name, value)
	}
	const queryString = query.toString()
	return queryString === '' ? '/portal' : `/portal?${queryString}`
}

function documentColumns(basePath: string): readonly TableColumn<PortalDocumentSummary>[] {
	return [
		{
			id: 'number',
			header: 'Document',
			cell: (document) => (
				<Link href={`${basePath}/${document.id}`} className="text-accent hover:underline">
					{document.number}
				</Link>
			)
		},
		{
			id: 'documentDate',
			header: 'Date',
			cell: (document) => formatBusinessDate(document.documentDate)
		},
		{ id: 'dueDate', header: 'Due', cell: (document) => formatBusinessDate(document.dueDate) },
		{
			id: 'status',
			header: 'Status',
			cell: (document) => (
				<PortalStatusBadge status={document.status} overdueAmount={document.overdueAmount} />
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
}

const paymentColumns: readonly TableColumn<PortalPaymentSummary>[] = [
	{
		id: 'number',
		header: 'Receipt',
		cell: (payment) => (
			<Link href={`/portal/payments/${payment.id}`} className="text-accent hover:underline">
				{payment.number}
			</Link>
		)
	},
	{
		id: 'paymentDate',
		header: 'Date',
		cell: (payment) => formatBusinessDate(payment.paymentDate)
	},
	{
		id: 'status',
		header: 'Status',
		cell: (payment) => <PortalPaymentStatusBadge status={payment.status} />
	},
	{
		id: 'amount',
		header: 'Amount',
		isNumeric: true,
		cell: (payment) => formatAmount(payment.amount)
	}
]

export default async function PortalPage({
	searchParams
}: {
	searchParams: Promise<PortalParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const [invoices, bills, payments] = await Promise.all([
		listPortalCustomerInvoices(actor, {
			page: pageNumber(params.invoicePage),
			pageSize: PAGE_SIZE
		}),
		listPortalVendorBills(actor, { page: pageNumber(params.billPage), pageSize: PAGE_SIZE }),
		listPortalPayments(actor, { page: pageNumber(params.paymentPage), pageSize: PAGE_SIZE })
	])

	if (!invoices.ok) return <ErrorState description={invoices.error.message} />
	if (!bills.ok) return <ErrorState description={bills.error.message} />
	if (!payments.ok) return <ErrorState description={payments.error.message} />

	const hasNothing =
		invoices.data.rows.length === 0 &&
		bills.data.rows.length === 0 &&
		payments.data.rows.length === 0

	return (
		<>
			<PageHeader
				title={`Welcome, ${actor.displayName}`}
				lead="Your posted documents and payment history with this business."
			/>

			{hasNothing && (
				<EmptyState
					icon={Inbox}
					title="Nothing to show yet"
					description="Posted invoices, bills and payments linked to your contact record appear here."
				/>
			)}

			{invoices.data.rows.length > 0 && (
				<WorkSurface
					title="Invoices"
					description="Invoices you owe. Open one to pay its outstanding amount."
					isFlush
				>
					<DataTable
						caption="Your customer invoices"
						columns={documentColumns('/portal/invoices')}
						rows={invoices.data.rows}
						getRowKey={(document) => document.id}
					/>
					<Pagination
						page={invoices.data.page}
						pageSize={invoices.data.pageSize}
						totalCount={invoices.data.totalCount}
						itemNoun="invoices"
						buildHref={(page) => buildPortalHref(params, { invoicePage: String(page) })}
					/>
				</WorkSurface>
			)}

			{bills.data.rows.length > 0 && (
				<WorkSurface
					title="Bills"
					description="Bills this business owes you. These are read-only."
					isFlush
				>
					<DataTable
						caption="Your vendor bills"
						columns={documentColumns('/portal/bills')}
						rows={bills.data.rows}
						getRowKey={(document) => document.id}
					/>
					<Pagination
						page={bills.data.page}
						pageSize={bills.data.pageSize}
						totalCount={bills.data.totalCount}
						itemNoun="bills"
						buildHref={(page) => buildPortalHref(params, { billPage: String(page) })}
					/>
				</WorkSurface>
			)}

			{payments.data.rows.length > 0 && (
				<WorkSurface title="Payment history" isFlush>
					<DataTable
						caption="Your payments"
						columns={paymentColumns}
						rows={payments.data.rows}
						getRowKey={(payment) => payment.id}
					/>
					<Pagination
						page={payments.data.page}
						pageSize={payments.data.pageSize}
						totalCount={payments.data.totalCount}
						itemNoun="payments"
						buildHref={(page) => buildPortalHref(params, { paymentPage: String(page) })}
					/>
				</WorkSurface>
			)}

			{!hasNothing && invoices.data.rows.length === 0 && (
				<EmptyState
					icon={FileText}
					title="No invoices yet"
					description="Posted invoices addressed to you will appear here."
				/>
			)}

			{!hasNothing && payments.data.rows.length === 0 && (
				<EmptyState
					icon={Wallet}
					title="No payments yet"
					description="Payments you make appear here with their receipt."
				/>
			)}
		</>
	)
}
