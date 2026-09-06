import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, ShoppingCart } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { ErrorState, EmptyState } from '@/components/ui/state-panel'
import {
	purchaseOrderStates,
	type PurchaseOrderState,
	type PurchaseOrderSummary
} from '@/lib/contracts/purchase-order'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listPurchaseOrders } from '@/server/purchasing'
import { OrderStateBadge } from '@/app/(workspace)/purchases/orders/order-state-badge'

const PAGE_SIZE = 20

const STATE_LABELS: Record<PurchaseOrderState, string> = {
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
	return queryString === '' ? '/purchases/orders' : `/purchases/orders?${queryString}`
}

async function PurchaseOrdersTable({ params }: { params: OrderParams }) {
	const actor = await getActor()
	const result = await listPurchaseOrders(actor, {
		state: (params.state as 'ALL') ?? 'ALL',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) {
		return <ErrorState description={result.error.message} />
	}

	const columns: readonly TableColumn<PurchaseOrderSummary>[] = [
		{ id: 'orderNumber', header: 'Order', cell: (order) => order.orderNumber },
		{ id: 'vendor', header: 'Vendor', cell: (order) => order.vendor.name },
		{
			id: 'orderDate',
			header: 'Order date',
			cell: (order) => formatBusinessDate(order.orderDate)
		},
		{ id: 'createdBy', header: 'Created by', cell: (order) => order.createdBy.displayName },
		{
			id: 'state',
			header: 'Status',
			cell: (order) => <OrderStateBadge state={order.state} />
		},
		{
			id: 'total',
			header: 'Total',
			isNumeric: true,
			cell: (order) => formatAmount(order.total)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Purchase orders"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(order) => order.id}
				getRowHref={(order) => `/purchases/orders/${order.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={ShoppingCart}
							title="No purchase orders match this filter"
							description="A purchase order records what was agreed with a vendor before anything is received or billed."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="purchase orders"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function PurchaseOrdersPage({
	searchParams
}: {
	searchParams: Promise<OrderParams>
}) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Purchase orders"
				lead="What was agreed with a vendor. Receipts and vendor bills follow separately."
				action={
					actor.capabilities.includes('transactions:create') ? (
						<Link href="/purchases/orders/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New purchase order
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/purchases/orders"
				hasSearch={false}
				searchLabel="Filter purchase orders"
				resetHref="/purchases/orders"
			>
				<ToolbarFilter
					label="Status"
					name="state"
					defaultValue={params.state ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All statuses' },
						...purchaseOrderStates.map((value) => ({ value, label: STATE_LABELS[value] }))
					]}
				/>
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
				<PurchaseOrdersTable params={params} />
			</Suspense>
		</>
	)
}
