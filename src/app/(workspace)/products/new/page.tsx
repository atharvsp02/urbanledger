import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { listProductCategories } from '@/server/masters/product-categories'
import { ProductForm } from '@/app/(workspace)/products/product-form'

export const metadata: Metadata = { title: 'New product' }

export default async function NewProductPage() {
	const categories = await listProductCategories()

	return (
		<>
			<PageHeader
				title="New product"
				lead="Create a goods, service or combo product."
				breadcrumbs={[{ label: 'Products', href: '/products' }, { label: 'New product' }]}
			/>
			<ProductForm categories={categories} />
		</>
	)
}
