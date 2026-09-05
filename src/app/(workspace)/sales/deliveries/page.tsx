import { Suspense } from 'react'
import Link from 'next/link'
import { Truck } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { SalesDeliverySummary } from '@/lib/contracts/sales-delivery'
import { formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listSalesDeliveries } from '@/server/sales'

const PAGE_SIZE = 20

type DeliveryParams = { from?: string; to?: string; page?: string }

function buildHref(params: DeliveryParams, patch: DeliveryParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/sales/deliveries' : `/sales/deliveries?${queryString}`
}

async function DeliveriesTable({ params }: { params: DeliveryParams }) {
	const actor = await getActor()
	const result = await listSalesDeliveries(actor, {
		dateFrom: params.from === '' ? undefined : params.from,
		dateTo: params.to === '' ? undefined : params.to,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<SalesDeliverySummary>[] = [
		{ id: 'deliveryNumber', header: 'Delivery', cell: (delivery) => delivery.deliveryNumber },
		{
			id: 'deliveryDate',
			header: 'Delivery date',
			cell: (delivery) => formatBusinessDate(delivery.deliveryDate)
		},
		{ id: 'customer', header: 'Customer', cell: (delivery) => delivery.customer.name },
		{
			id: 'sourceOrder',
			header: 'Sales order',
			cell: (delivery) => (
				<Link
					href={`/sales/orders/${delivery.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{delivery.sourceOrder.orderNumber}
				</Link>
			)
		},
		{ id: 'createdBy', header: 'Recorded by', cell: (delivery) => delivery.createdBy.displayName }
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Sales deliveries"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(delivery) => delivery.id}
				getRowHref={(delivery) => `/sales/deliveries/${delivery.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Truck}
							title="No deliveries in this range"
							description="A delivery records goods leaving or services being fulfilled against a confirmed sales order."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="deliveries"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function SalesDeliveriesPage({
	searchParams
}: {
	searchParams: Promise<DeliveryParams>
}) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Deliveries"
				lead="Physical dispatch and service fulfilment. Deliveries change quantity, never the ledger."
			/>

			<form
				method="get"
				action="/sales/deliveries"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
			>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="deliveries-from" label="From" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="from" defaultValue={params.from ?? ''} />
						)}
					</Field>
					<Field id="deliveries-to" label="To" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="to" defaultValue={params.to ?? ''} />
						)}
					</Field>
				</FieldRow>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<Link
						href="/sales/deliveries"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Clear
					</Link>
				</div>
			</form>

			<Suspense
				key={`${params.from}|${params.to}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={5} />}
			>
				<DeliveriesTable params={params} />
			</Suspense>
		</>
	)
}
