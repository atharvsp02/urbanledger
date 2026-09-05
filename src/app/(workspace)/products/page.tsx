import { Suspense } from 'react'
import Link from 'next/link'
import { Package, Plus, Tags } from 'lucide-react'
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
	productKinds,
	productSortColumns,
	PRODUCT_KIND_LABELS,
	PRODUCT_SORT_LABELS,
	type ProductSummary
} from '@/lib/masters/product'
import { listProductCategories } from '@/server/masters/product-categories'
import { listProducts } from '@/server/masters/products'

const PAGE_SIZE = 20

type ProductParams = {
	q?: string
	kind?: string
	category?: string
	archived?: string
	sort?: string
	dir?: string
	page?: string
}

function buildHref(params: ProductParams, patch: ProductParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/products' : `/products?${queryString}`
}

async function ProductsTable({ params }: { params: ProductParams }) {
	const result = await listProducts({
		search: params.q ?? '',
		kind: (params.kind as 'ALL') ?? 'ALL',
		categoryId: params.category ?? 'ALL',
		includeArchived: params.archived === 'include',
		sort: params.sort as 'name',
		direction: params.dir === 'desc' ? 'desc' : 'asc',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const columns: readonly TableColumn<ProductSummary>[] = [
		{
			id: 'name',
			header: 'Product',
			cell: (product) => (
				<span className="flex items-center gap-3">
					<ProductThumbnail kind={product.kind} className="size-8" />
					<span className="min-w-0">
						<span className="block font-medium">{product.name}</span>
						<span className="block text-xs text-muted-foreground">
							{product.sku ?? product.categoryName}
						</span>
					</span>
				</span>
			)
		},
		{ id: 'category', header: 'Category', cell: (product) => product.categoryName },
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
							title={
								(params.q ?? '') === '' ? 'No products yet' : 'No products match these filters'
							}
							description={
								(params.q ?? '') === ''
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
					pageSize={result.pageSize}
					totalCount={result.totalCount}
					itemNoun="products"
					buildHref={(page) => buildHref(params, { page: String(page) })}
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
	const categories = await listProductCategories()

	return (
		<>
			<PageHeader
				title="Products"
				lead="Goods, services and combos available on sales and purchase documents."
				action={
					<>
						<Link
							href="/products/categories"
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							<Tags aria-hidden="true" className="size-4" />
							Categories
						</Link>
						<Link href="/products/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New product
						</Link>
					</>
				}
			/>

			<ListToolbar
				action="/products"
				searchLabel="Search products"
				searchPlaceholder="Name, SKU or category"
				searchDefaultValue={params.q ?? ''}
				resetHref="/products"
			>
				<ToolbarFilter
					label="Type"
					name="kind"
					defaultValue={params.kind ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All types' },
						...productKinds.map((value) => ({ value, label: PRODUCT_KIND_LABELS[value] }))
					]}
				/>
				<ToolbarFilter
					label="Category"
					name="category"
					defaultValue={params.category ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All categories' },
						...categories.map((category) => ({ value: category.id, label: category.name }))
					]}
				/>
				<ToolbarFilter
					label="Archived"
					name="archived"
					defaultValue={params.archived === 'include' ? 'include' : 'exclude'}
					options={[
						{ value: 'exclude', label: 'Active only' },
						{ value: 'include', label: 'Include archived' }
					]}
				/>
				<ToolbarFilter
					label="Sort by"
					name="sort"
					defaultValue={params.sort ?? 'name'}
					options={productSortColumns.map((value) => ({
						value,
						label: PRODUCT_SORT_LABELS[value]
					}))}
				/>
				<ToolbarFilter
					label="Order"
					name="dir"
					defaultValue={params.dir === 'desc' ? 'desc' : 'asc'}
					options={[
						{ value: 'asc', label: 'Ascending' },
						{ value: 'desc', label: 'Descending' }
					]}
				/>
			</ListToolbar>

			<Suspense
				key={`${params.q}|${params.kind}|${params.category}|${params.archived}|${params.sort}|${params.dir}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={6} />}
			>
				<ProductsTable params={params} />
			</Suspense>
		</>
	)
}
