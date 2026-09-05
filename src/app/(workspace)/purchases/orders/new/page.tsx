import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { listSelectableVendors } from '@/server/masters/contacts'
import { listSelectableProducts } from '@/server/masters/products'
import { PurchaseOrderForm } from '@/app/(workspace)/purchases/orders/purchase-order-form'

export const metadata: Metadata = { title: 'New purchase order' }

export default async function NewPurchaseOrderPage() {
	const [vendors, products] = await Promise.all([listSelectableVendors(), listSelectableProducts()])

	return (
		<>
			<PageHeader
				title="New purchase order"
				lead="Record what was agreed with a vendor. Nothing is received, billed or posted yet."
				breadcrumbs={[
					{ label: 'Purchase orders', href: '/purchases/orders' },
					{ label: 'New purchase order' }
				]}
			/>
			<PurchaseOrderForm vendors={vendors} products={products} />
		</>
	)
}
