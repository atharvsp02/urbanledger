import { Suspense } from 'react'
import Link from 'next/link'
import { Boxes } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { InventoryPosition } from '@/lib/contracts/purchase-receipt'
import { formatQuantity } from '@/lib/format'
import { PRODUCT_KIND_LABELS } from '@/lib/masters/product'
import { getActor } from '@/server/auth/actor'
import { getInventoryPositions } from '@/server/purchasing'

const PAGE_SIZE = 20

type StockParams = { page?: string }

async function StockTable({ params }: { params: StockParams }) {
	const actor = await getActor()
	const result = await getInventoryPositions(actor, {
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) {
		return <ErrorState description={result.error.message} />
	}

	const columns: readonly TableColumn<InventoryPosition>[] = [
		{
			id: 'product',
			header: 'Product',
			cell: (position) => (
				<Link href={`/products/${position.productId}`} className="text-accent hover:underline">
					{position.productName}
				</Link>
			)
		},
		{
			id: 'kind',
			header: 'Type',
			cell: (position) => <Badge>{PRODUCT_KIND_LABELS[position.productKind]}</Badge>
		},
		{
			id: 'quantity',
			header: 'Quantity on hand',
			isNumeric: true,
			cell: (position) => formatQuantity(position.quantityOnHand)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Stock on hand"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(position) => position.productId}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Boxes}
							title="No stock on hand"
							description="Quantity appears here once goods or combo lines are received against a purchase order."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="products"
					buildHref={(page) => (page === 1 ? '/stock' : `/stock?page=${page}`)}
				/>
			)}
		</div>
	)
}

export default async function StockPage({ searchParams }: { searchParams: Promise<StockParams> }) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Stock"
				lead="Quantity on hand from recorded receipts. Quantity is not an inventory valuation."
			/>

			<Suspense key={params.page} fallback={<SkeletonTable rows={6} columns={3} />}>
				<StockTable params={params} />
			</Suspense>
		</>
	)
}
