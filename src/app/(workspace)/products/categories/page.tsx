import type { Metadata } from 'next'
import { Tags } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/state-panel'
import type { ProductCategorySummary } from '@/lib/masters/product'
import { getActor } from '@/server/auth/actor'
import { listProductCategories } from '@/server/masters/product-categories'
import { CategoryForm } from '@/app/(workspace)/products/categories/category-form'

export const metadata: Metadata = { title: 'Product categories' }

export default async function ProductCategoriesPage() {
	const actor = await getActor()
	const categories = await listProductCategories({ includeArchived: true })
	const canCreate = actor.capabilities.includes('masters:create')

	const columns: readonly TableColumn<ProductCategorySummary>[] = [
		{ id: 'name', header: 'Category', cell: (category) => category.name },
		{
			id: 'products',
			header: 'Products',
			isNumeric: true,
			cell: (category) => category.productCount
		},
		{
			id: 'status',
			header: 'Status',
			cell: (category) =>
				category.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<>
			<PageHeader
				title="Product categories"
				lead="Categories group products for selection and reporting. Archived categories stay on the products that already reference them."
				breadcrumbs={[{ label: 'Products', href: '/products' }, { label: 'Categories' }]}
			/>

			{canCreate && <CategoryForm />}

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Product categories"
					columns={columns}
					rows={categories}
					getRowKey={(category) => category.id}
					emptyState={
						<div className="p-5">
							<EmptyState
								icon={Tags}
								title="No categories yet"
								description="Create a category before adding products."
							/>
						</div>
					}
				/>
			</div>
		</>
	)
}
