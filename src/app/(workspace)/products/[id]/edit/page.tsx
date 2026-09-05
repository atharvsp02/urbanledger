import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'
import { ProductForm } from '@/app/(workspace)/products/product-form'
import { getProduct } from '@/server/dev-fixtures/products'

export const metadata: Metadata = { title: 'Edit product' }

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const product = getProduct(id)
	if (product == null) notFound()

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
			<FixtureNotice master="products" />
			<ProductForm product={product} />
		</>
	)
}
