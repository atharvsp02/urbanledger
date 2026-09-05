import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState, StatePanel } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getPurchaseOrder, getPurchaseOrderOptions } from '@/server/purchasing'
import { PurchaseOrderForm } from '@/app/(workspace)/purchases/orders/purchase-order-form'

export const metadata: Metadata = { title: 'Edit purchase order' }

export default async function EditPurchaseOrderPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getPurchaseOrder(actor, { purchaseOrderId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const order = result.data
	const breadcrumbs = [
		{ label: 'Purchase orders', href: '/purchases/orders' },
		{ label: order.orderNumber, href: `/purchases/orders/${order.id}` },
		{ label: 'Edit' }
	]

	if (order.state !== 'DRAFT') {
		return (
			<>
				<PageHeader title={`Edit ${order.orderNumber}`} breadcrumbs={breadcrumbs} />
				<StatePanel
					icon={Lock}
					tone="warning"
					title="This order can no longer be edited"
					description="Only draft purchase orders are editable. Confirmed and cancelled orders keep the commercial terms they were closed with."
				/>
			</>
		)
	}

	const options = await getPurchaseOrderOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

	return (
		<>
			<PageHeader
				title={`Edit ${order.orderNumber}`}
				lead="Draft orders can still change. Confirming freezes these lines, including tax and analytic choices."
				breadcrumbs={breadcrumbs}
			/>
			<PurchaseOrderForm order={order} options={options.data} />
		</>
	)
}
