import { Suspense } from 'react'
import Link from 'next/link'
import { ReceiptText } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import { vendorBillStates, type VendorBillSummary } from '@/lib/contracts/vendor-bill'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listVendorBills } from '@/server/purchasing'
import { BillStateBadge } from '@/app/(workspace)/purchases/bills/bill-state-badge'

const PAGE_SIZE = 20

const STATE_LABELS: Record<(typeof vendorBillStates)[number], string> = {
	DRAFT: 'Draft',
	POSTED: 'Posted',
	CANCELLED: 'Cancelled'
}

type BillParams = { state?: string; page?: string }

function buildHref(params: BillParams, patch: BillParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/purchases/bills' : `/purchases/bills?${queryString}`
}

async function VendorBillsTable({ params }: { params: BillParams }) {
	const actor = await getActor()
	const result = await listVendorBills(actor, {
		state: (params.state as 'ALL') ?? 'ALL',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) {
		return <ErrorState description={result.error.message} />
	}

	const columns: readonly TableColumn<VendorBillSummary>[] = [
		{ id: 'billNumber', header: 'Bill', cell: (bill) => bill.billNumber },
		{ id: 'vendor', header: 'Vendor', cell: (bill) => bill.vendor.name },
		{
			id: 'sourceOrder',
			header: 'Purchase order',
			cell: (bill) => (
				<Link
					href={`/purchases/orders/${bill.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{bill.sourceOrder.orderNumber}
				</Link>
			)
		},
		{ id: 'billDate', header: 'Bill date', cell: (bill) => formatBusinessDate(bill.billDate) },
		{ id: 'dueDate', header: 'Due', cell: (bill) => formatBusinessDate(bill.dueDate) },
		{ id: 'state', header: 'Status', cell: (bill) => <BillStateBadge state={bill.state} /> },
		{ id: 'total', header: 'Total', isNumeric: true, cell: (bill) => formatAmount(bill.total) }
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Vendor bills"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(bill) => bill.id}
				getRowHref={(bill) => `/purchases/bills/${bill.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={ReceiptText}
							title="No vendor bills match this filter"
							description="A vendor bill is generated from a received purchase order and reaches the ledger only when posted."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="vendor bills"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function VendorBillsPage({
	searchParams
}: {
	searchParams: Promise<BillParams>
}) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Vendor bills"
				lead="Generated from received purchase orders. Posting records the expense and payable."
			/>

			<ListToolbar
				action="/purchases/bills"
				hasSearch={false}
				searchLabel="Filter vendor bills"
				resetHref="/purchases/bills"
			>
				<ToolbarFilter
					label="Status"
					name="state"
					defaultValue={params.state ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All statuses' },
						...vendorBillStates.map((value) => ({ value, label: STATE_LABELS[value] }))
					]}
				/>
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={7} />}>
				<VendorBillsTable params={params} />
			</Suspense>
		</>
	)
}
