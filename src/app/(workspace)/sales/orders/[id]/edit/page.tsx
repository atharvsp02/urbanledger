import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState, StatePanel } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getSalesOrder, getSalesOrderOptions } from '@/server/sales'
import { SalesOrderForm } from '@/app/(workspace)/sales/orders/sales-order-form'

export const metadata: Metadata = { title: 'Edit sales order' }

export default async function EditSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getSalesOrder(actor, { salesOrderId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const order = result.data
	const breadcrumbs = [
		{ label: 'Sales orders', href: '/sales/orders' },
		{ label: order.orderNumber, href: `/sales/orders/${order.id}` },
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
					description="Only draft sales orders are editable. Confirmed and cancelled orders keep the commercial terms they were closed with."
				/>
			</>
		)
	}

	const options = await getSalesOrderOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

	return (
		<>
			<PageHeader
				title={`Edit ${order.orderNumber}`}
				lead="Draft orders can still change. Confirming freezes these lines."
				breadcrumbs={breadcrumbs}
			/>
			<SalesOrderForm order={order} options={options.data} />
		</>
	)
}
