import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'
import { ProductForm } from '@/app/(workspace)/products/product-form'

export const metadata: Metadata = { title: 'New product' }

export default function NewProductPage() {
	return (
		<>
			<PageHeader
				title="New product"
				lead="Create a goods, service or combo product."
				breadcrumbs={[{ label: 'Products', href: '/products' }, { label: 'New product' }]}
			/>
			<FixtureNotice>
				Products are held in temporary local data until the master-data service is connected.
				Records created here do not survive a server restart.
			</FixtureNotice>
			<ProductForm />
		</>
	)
}
