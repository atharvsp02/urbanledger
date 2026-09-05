import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { listProductCategories } from '@/server/masters/product-categories'
import { getProduct } from '@/server/masters/products'
import { ApplicationError } from '@/server/errors/application-error'
import { ProductForm } from '@/app/(workspace)/products/product-form'

export const metadata: Metadata = { title: 'Edit product' }

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	let product

	try {
		product = await getProduct(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const categories = await listProductCategories()

	return (
		<>
			<PageHeader
				title={`Edit ${product.name}`}
				lead="Prices apply to future documents. Issued documents keep the prices they were created with."
				breadcrumbs={[
					{ label: 'Products', href: '/products' },
					{ label: product.name, href: `/products/${product.id}` },
					{ label: 'Edit' }
				]}
			/>
			<ProductForm product={product} categories={categories} />
		</>
	)
}
