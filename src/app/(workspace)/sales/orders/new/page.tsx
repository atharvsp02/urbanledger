import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getSalesOrderOptions } from '@/server/sales'
import { SalesOrderForm } from '@/app/(workspace)/sales/orders/sales-order-form'

export const metadata: Metadata = { title: 'New sales order' }

export default async function NewSalesOrderPage() {
	const actor = await getActor()
	const options = await getSalesOrderOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

	return (
		<>
			<PageHeader
				title="New sales order"
				lead="Record what the customer agreed to buy. Nothing is delivered, invoiced or posted yet."
				breadcrumbs={[
					{ label: 'Sales orders', href: '/sales/orders' },
					{ label: 'New sales order' }
				]}
			/>
			<SalesOrderForm options={options.data} />
		</>
	)
}
