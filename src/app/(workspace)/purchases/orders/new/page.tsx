import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getPurchaseOrderOptions } from '@/server/purchasing'
import { PurchaseOrderForm } from '@/app/(workspace)/purchases/orders/purchase-order-form'

export const metadata: Metadata = { title: 'New purchase order' }

export default async function NewPurchaseOrderPage() {
	const actor = await getActor()
	const options = await getPurchaseOrderOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

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
			<PurchaseOrderForm options={options.data} />
		</>
	)
}
