import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { PurchaseOrderLine } from '@/lib/contracts/purchase-order'
import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getPurchaseOrder } from '@/server/purchasing'
import { OrderStateBadge } from '@/app/(workspace)/purchases/orders/order-state-badge'
import { TransitionControls } from '@/app/(workspace)/purchases/orders/[id]/transition-controls'

export default async function PurchaseOrderDetailPage({
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
	const isDraft = order.state === 'DRAFT'
	const canTransact = actor.capabilities.includes('transactions:create')

	const columns: readonly TableColumn<PurchaseOrderLine>[] = [
		{ id: 'product', header: 'Product', cell: (line) => line.productName },
		{
			id: 'quantity',
			header: 'Quantity',
			isNumeric: true,
			cell: (line) => formatQuantity(line.quantity)
		},
		{
			id: 'unitPrice',
			header: 'Unit price',
			isNumeric: true,
			cell: (line) => formatAmount(trimMoneyScale(line.unitPrice))
		},
		{
			id: 'lineTotal',
			header: 'Line total',
			isNumeric: true,
			cell: (line) => formatAmount(line.lineTotal)
		}
	]

	const details: readonly { label: string; value: string }[] = [
		{ label: 'Vendor', value: order.vendor.name },
		{ label: 'Order date', value: formatBusinessDate(order.orderDate) },
		{ label: 'Created by', value: order.createdBy.displayName },
		{ label: 'Revision', value: String(order.revision) }
	]

	return (
		<>
			<PageHeader
				title={order.orderNumber}
				lead={order.vendor.name}
				breadcrumbs={[
					{ label: 'Purchase orders', href: '/purchases/orders' },
					{ label: order.orderNumber }
				]}
				action={
					isDraft && canTransact ? (
						<>
							<Link
								href={`/purchases/orders/${order.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
							<TransitionControls
								purchaseOrderId={order.id}
								orderNumber={order.orderNumber}
								revision={order.revision}
							/>
						</>
					) : null
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<OrderStateBadge state={order.state} />
				{!isDraft && (
					<span className="text-sm text-muted-foreground">
						This order is read-only. Its commercial lines are frozen.
					</span>
				)}
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
				<WorkSurface title="Order">
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
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

				<WorkSurface title="Total">
					<p className="text-2xl font-semibold tabular-nums">{formatAmount(order.total)}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Calculated and stored by the server from the saved lines.
					</p>
				</WorkSurface>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Purchase order lines"
					columns={columns}
					rows={order.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
