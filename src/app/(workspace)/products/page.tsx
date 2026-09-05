import { Suspense } from 'react'
import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { ProductThumbnail } from '@/components/ui/placeholder'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/state-panel'
import { formatAmount } from '@/lib/format'
import {
	PRODUCT_KINDS,
	PRODUCT_KIND_LABELS,
	type Product,
	type ProductKind
} from '@/lib/masters/product'
import { listProducts } from '@/server/dev-fixtures/products'

const PAGE_SIZE = 10

type ProductParams = { q?: string; kind?: string; archived?: string; page?: string }

async function ProductsTable({ params }: { params: ProductParams }) {
	const kind: ProductKind | 'all' = PRODUCT_KINDS.includes(params.kind as ProductKind)
		? (params.kind as ProductKind)
		: 'all'
	const includeArchived = params.archived === 'include'
	const search = params.q ?? ''

	const result = listProducts({
		search,
		kind,
		includeArchived,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const buildHref = (patch: ProductParams) => {
		const merged = { ...params, ...patch }
		const query = new URLSearchParams()
		for (const [key, value] of Object.entries(merged)) {
			if (value != null && value !== '') query.set(key, value)
		}
		const queryString = query.toString()
		return queryString === '' ? '/products' : `/products?${queryString}`
	}

	const columns: readonly TableColumn<Product>[] = [
		{
			id: 'name',
			header: 'Product',
			cell: (product) => (
				<span className="flex items-center gap-3">
					<ProductThumbnail kind={product.kind} className="size-8" />
					<span className="min-w-0">
						<span className="block font-medium">{product.name}</span>
						<span className="block text-xs text-muted-foreground">{product.category}</span>
					</span>
				</span>
			)
		},
		{
			id: 'kind',
			header: 'Type',
			cell: (product) => <Badge>{PRODUCT_KIND_LABELS[product.kind]}</Badge>
		},
		{
			id: 'salesPrice',
			header: 'Sales price',
			isNumeric: true,
			cell: (product) => formatAmount(product.salesPrice)
		},
		{
			id: 'purchaseCost',
			header: 'Purchase cost',
			isNumeric: true,
			cell: (product) => formatAmount(product.purchaseCost)
		},
		{
			id: 'status',
			header: 'Status',
			cell: (product) =>
				product.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Products"
				columns={columns}
				rows={result.rows}
				getRowKey={(product) => product.id}
				getRowHref={(product) => `/products/${product.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Package}
							title={search === '' ? 'No products yet' : 'No products match these filters'}
							description={
								search === ''
									? 'Add the goods, services and combos this business sells or buys.'
									: 'Clear the search or choose a different type.'
							}
						>
							<Link href="/products/new" className={buttonVariants({ size: 'sm' })}>
								New product
							</Link>
						</EmptyState>
					</div>
				}
			/>
			{result.rows.length > 0 && (
				<Pagination
					page={result.page}
					pageSize={PAGE_SIZE}
					totalCount={result.totalCount}
					itemNoun="products"
					buildHref={(page) => buildHref({ page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function ProductsPage({
	searchParams
}: {
	searchParams: Promise<ProductParams>
}) {
	const params = await searchParams
	const kind: ProductKind | 'all' = PRODUCT_KINDS.includes(params.kind as ProductKind)
		? (params.kind as ProductKind)
		: 'all'
	const includeArchived = params.archived === 'include'
	const search = params.q ?? ''

	return (
		<>
			<PageHeader
				title="Products"
				lead="Goods, services and combos available on sales and purchase documents."
				action={
					<Link href="/products/new" className={buttonVariants({ size: 'sm' })}>
						<Plus aria-hidden="true" className="size-4" />
						New product
					</Link>
				}
			/>

			<ListToolbar
				action="/products"
				searchLabel="Search products"
				searchPlaceholder="Name or category"
				searchDefaultValue={search}
				resetHref="/products"
			>
				<ToolbarFilter
					label="Type"
					name="kind"
					defaultValue={kind}
					options={[
						{ value: 'all', label: 'All types' },
						...PRODUCT_KINDS.map((value) => ({ value, label: PRODUCT_KIND_LABELS[value] }))
					]}
				/>
				<ToolbarFilter
					label="Archived"
					name="archived"
					defaultValue={includeArchived ? 'include' : 'exclude'}
					options={[
						{ value: 'exclude', label: 'Active only' },
						{ value: 'include', label: 'Include archived' }
					]}
				/>
			</ListToolbar>

			<Suspense
				key={`${search}|${kind}|${includeArchived}|${params.page ?? '1'}`}
				fallback={<SkeletonTable rows={6} columns={5} />}
			>
				<ProductsTable params={params} />
			</Suspense>
		</>
	)
}
