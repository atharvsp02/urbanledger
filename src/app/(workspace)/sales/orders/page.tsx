import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, ShoppingBag } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import { salesOrderStates, type SalesOrderSummary } from '@/lib/contracts/sales-order'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listSalesOrders } from '@/server/sales'
import { SalesOrderStateBadge } from '@/app/(workspace)/sales/orders/order-state-badge'

const PAGE_SIZE = 20

const STATE_LABELS: Record<(typeof salesOrderStates)[number], string> = {
	DRAFT: 'Draft',
	CONFIRMED: 'Confirmed',
	CANCELLED: 'Cancelled'
}

type OrderParams = { state?: string; page?: string }

function buildHref(params: OrderParams, patch: OrderParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/sales/orders' : `/sales/orders?${queryString}`
}

async function SalesOrdersTable({ params }: { params: OrderParams }) {
	const actor = await getActor()
	const result = await listSalesOrders(actor, {
		state: (params.state as 'ALL') ?? 'ALL',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<SalesOrderSummary>[] = [
		{ id: 'orderNumber', header: 'Order', cell: (order) => order.orderNumber },
		{ id: 'customer', header: 'Customer', cell: (order) => order.customer.name },
		{
			id: 'orderDate',
			header: 'Order date',
			cell: (order) => formatBusinessDate(order.orderDate)
		},
		{ id: 'createdBy', header: 'Created by', cell: (order) => order.createdBy.displayName },
		{
			id: 'state',
			header: 'Status',
			cell: (order) => <SalesOrderStateBadge state={order.state} />
		},
		{ id: 'net', header: 'Net', isNumeric: true, cell: (order) => formatAmount(order.netTotal) },
		{ id: 'total', header: 'Gross', isNumeric: true, cell: (order) => formatAmount(order.total) }
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Sales orders"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(order) => order.id}
				getRowHref={(order) => `/sales/orders/${order.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={ShoppingBag}
							title="No sales orders match this filter"
							description="A sales order records what a customer agreed to buy before delivery or invoicing."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="sales orders"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function SalesOrdersPage({
	searchParams
}: {
	searchParams: Promise<OrderParams>
}) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Sales orders"
				lead="What a customer agreed to buy. Delivery and invoicing follow separately."
				action={
					actor.capabilities.includes('transactions:create') ? (
						<Link href="/sales/orders/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New sales order
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/sales/orders"
				hasSearch={false}
				searchLabel="Filter sales orders"
				resetHref="/sales/orders"
			>
				<ToolbarFilter
					label="Status"
					name="state"
					defaultValue={params.state ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All statuses' },
						...salesOrderStates.map((value) => ({ value, label: STATE_LABELS[value] }))
					]}
				/>
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={7} />}>
				<SalesOrdersTable params={params} />
			</Suspense>
		</>
	)
}
