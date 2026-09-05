import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { SalesDeliveryDetail } from '@/lib/contracts/sales-delivery'
import { formatBusinessDate, formatQuantity } from '@/lib/format'
import { PRODUCT_KIND_LABELS } from '@/lib/masters/product'
import { getActor } from '@/server/auth/actor'
import { getSalesDelivery } from '@/server/sales'

type DeliveryLine = SalesDeliveryDetail['lines'][number]

export default async function SalesDeliveryDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getSalesDelivery(actor, { salesDeliveryId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const delivery = result.data
	const movesStock = (line: DeliveryLine) => line.productKind !== 'SERVICE'

	const columns: readonly TableColumn<DeliveryLine>[] = [
		{ id: 'product', header: 'Product', cell: (line) => line.productName },
		{
			id: 'kind',
			header: 'Type',
			cell: (line) => (
				<Badge tone={movesStock(line) ? 'accent' : 'neutral'}>
					{PRODUCT_KIND_LABELS[line.productKind]}
				</Badge>
			)
		},
		{
			id: 'effect',
			header: 'Effect',
			cell: (line) => (movesStock(line) ? 'Quantity delivered' : 'Service fulfilled')
		},
		{
			id: 'quantity',
			header: 'Quantity',
			isNumeric: true,
			cell: (line) => formatQuantity(line.quantity)
		},
		{
			id: 'movement',
			header: 'Stock movement',
			cell: (line) =>
				line.inventoryMovementId == null ? (
					<span className="text-muted-foreground">None</span>
				) : (
					<Link href="/stock/movements" className="text-accent hover:underline">
						Recorded
					</Link>
				)
		}
	]

	const details: readonly { label: string; value: React.ReactNode }[] = [
		{
			label: 'Customer',
			value: (
				<Link href={`/contacts/${delivery.customer.id}`} className="text-accent hover:underline">
					{delivery.customer.name}
				</Link>
			)
		},
		{ label: 'Delivery date', value: formatBusinessDate(delivery.deliveryDate) },
		{ label: 'Recorded by', value: delivery.createdBy.displayName },
		{
			label: 'Sales order',
			value: (
				<Link
					href={`/sales/orders/${delivery.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{delivery.sourceOrder.orderNumber}
				</Link>
			)
		}
	]

	return (
		<>
			<PageHeader
				title={delivery.deliveryNumber}
				lead={delivery.customer.name}
				breadcrumbs={[
					{ label: 'Deliveries', href: '/sales/deliveries' },
					{ label: delivery.deliveryNumber }
				]}
			/>

			<WorkSurface title="Delivery">
				<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
					{details.map((detail) => (
						<div key={detail.label}>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								{detail.label}
							</dt>
							<dd className="mt-0.5 text-sm break-words">{detail.value}</dd>
						</div>
					))}
				</dl>
			</WorkSurface>

			<p className="rounded-xl border border-border bg-surface-soft p-3 text-sm text-muted-foreground">
				Goods and Combo lines reduce quantity on hand. Service lines record fulfilment only and
				never create a stock movement. A delivery makes no accounting entry; the posted invoice does
				that.
			</p>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Delivered and fulfilled lines"
					columns={columns}
					rows={delivery.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
