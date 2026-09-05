import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { SelectInput, TextInput } from '@/components/ui/inputs'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { InventoryMovement } from '@/lib/contracts/sales-delivery'
import { formatBusinessDate, formatQuantity } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listSelectableProducts } from '@/server/masters/products'
import { listInventoryMovements } from '@/server/sales'

const PAGE_SIZE = 20

type MovementParams = { from?: string; to?: string; product?: string; page?: string }

function buildHref(params: MovementParams, patch: MovementParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/stock/movements' : `/stock/movements?${queryString}`
}

function sourceHref(movement: InventoryMovement) {
	return movement.sourceType === 'PURCHASE_RECEIPT'
		? `/purchases/receipts/${movement.sourceId}`
		: `/sales/deliveries/${movement.sourceId}`
}

async function MovementsTable({ params }: { params: MovementParams }) {
	const actor = await getActor()
	const result = await listInventoryMovements(actor, {
		dateFrom: params.from === '' ? undefined : params.from,
		dateTo: params.to === '' ? undefined : params.to,
		productId: params.product === '' || params.product === 'ALL' ? undefined : params.product,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<InventoryMovement>[] = [
		{
			id: 'movementDate',
			header: 'Date',
			cell: (movement) => formatBusinessDate(movement.movementDate)
		},
		{
			id: 'product',
			header: 'Product',
			cell: (movement) => (
				<Link href={`/products/${movement.product.id}`} className="text-accent hover:underline">
					{movement.product.name}
				</Link>
			)
		},
		{
			id: 'direction',
			header: 'Direction',
			cell: (movement) =>
				movement.direction === 'IN' ? (
					<Badge tone="success" icon={ArrowDownLeft}>
						Inbound
					</Badge>
				) : (
					<Badge tone="warning" icon={ArrowUpRight}>
						Outbound
					</Badge>
				)
		},
		{
			id: 'quantityChange',
			header: 'Quantity change',
			isNumeric: true,
			cell: (movement) => formatQuantity(movement.quantityChange)
		},
		{
			id: 'source',
			header: 'Source',
			cell: (movement) => (
				<Link href={sourceHref(movement)} className="text-accent hover:underline">
					{movement.sourceNumber}
				</Link>
			)
		},
		{
			id: 'sourceType',
			header: 'Source type',
			cell: (movement) =>
				movement.sourceType === 'PURCHASE_RECEIPT' ? 'Purchase receipt' : 'Sales delivery'
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Stock movements"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(movement) => movement.id}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={History}
							title="No stock movements in this range"
							description="Movements appear when goods or combo lines are received or delivered."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="movements"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function StockMovementsPage({
	searchParams
}: {
	searchParams: Promise<MovementParams>
}) {
	const params = await searchParams
	const products = await listSelectableProducts()

	return (
		<>
			<PageHeader
				title="Stock movements"
				lead="Dated quantity changes from receipts and deliveries. Quantity is not a valuation."
				breadcrumbs={[{ label: 'Stock', href: '/stock' }, { label: 'Movements' }]}
			/>

			<form
				method="get"
				action="/stock/movements"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
			>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="movements-from" label="From" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="from" defaultValue={params.from ?? ''} />
						)}
					</Field>
					<Field id="movements-to" label="To" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="to" defaultValue={params.to ?? ''} />
						)}
					</Field>
				</FieldRow>
				<Field id="movements-product" label="Product" className="sm:w-56">
					{(props) => (
						<SelectInput {...props} name="product" defaultValue={params.product ?? 'ALL'}>
							<option value="ALL">All products</option>
							{products.map((product) => (
								<option key={product.id} value={product.id}>
									{product.name}
								</option>
							))}
						</SelectInput>
					)}
				</Field>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<Link
						href="/stock/movements"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Clear
					</Link>
				</div>
			</form>

			<Suspense
				key={`${params.from}|${params.to}|${params.product}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={6} />}
			>
				<MovementsTable params={params} />
			</Suspense>
		</>
	)
}
