import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { SalesOrderDetail } from '@/lib/contracts/sales-order'
import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { PRODUCT_KIND_LABELS } from '@/lib/masters/product'
import { getActor } from '@/server/auth/actor'
import { getSalesOrder } from '@/server/sales'
import { SalesOrderStateBadge } from '@/app/(workspace)/sales/orders/order-state-badge'
import { TransitionControls } from '@/app/(workspace)/sales/orders/[id]/transition-controls'
import {
	DeliveryControl,
	InvoiceControl
} from '@/app/(workspace)/sales/orders/[id]/fulfilment-controls'

type SalesLine = SalesOrderDetail['lines'][number]

export default async function SalesOrderDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getSalesOrder(actor, { salesOrderId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const order = result.data
	const isDraft = order.state === 'DRAFT'
	const isConfirmed = order.state === 'CONFIRMED'
	const canTransact = actor.capabilities.includes('transactions:create')
	const hasStockLines = order.lines.some((line) => line.productKind !== 'SERVICE')

	const columns: readonly TableColumn<SalesLine>[] = [
		{ id: 'product', header: 'Product', cell: (line) => line.productName },
		{
			id: 'kind',
			header: 'Type',
			cell: (line) => (
				<Badge tone={line.productKind === 'SERVICE' ? 'neutral' : 'accent'}>
					{PRODUCT_KIND_LABELS[line.productKind]}
				</Badge>
			)
		},
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
		{ id: 'net', header: 'Net', isNumeric: true, cell: (line) => formatAmount(line.lineNetTotal) },
		{
			id: 'tax',
			header: 'Tax',
			cell: (line) =>
				line.tax == null ? (
					<span className="text-muted-foreground">None</span>
				) : (
					`${line.tax.name} (${trimMoneyScale(line.tax.rate, 0)}%)`
				)
		},
		{
			id: 'taxAmount',
			header: 'Tax amount',
			isNumeric: true,
			cell: (line) => formatAmount(line.taxAmount)
		},
		{
			id: 'analytic',
			header: 'Analytic',
			cell: (line) =>
				line.analyticAccount == null ? (
					<span className="text-muted-foreground">None</span>
				) : (
					line.analyticAccount.name
				)
		},
		{
			id: 'gross',
			header: 'Gross',
			isNumeric: true,
			cell: (line) => formatAmount(line.grossTotal)
		}
	]

	const details: readonly { label: string; value: React.ReactNode }[] = [
		{
			label: 'Customer',
			value: (
				<Link href={`/contacts/${order.customer.id}`} className="text-accent hover:underline">
					{order.customer.name}
				</Link>
			)
		},
		{ label: 'Order date', value: formatBusinessDate(order.orderDate) },
		{ label: 'Created by', value: order.createdBy.displayName },
		{ label: 'Revision', value: String(order.revision) }
	]

	return (
		<>
			<PageHeader
				title={order.orderNumber}
				lead={order.customer.name}
				breadcrumbs={[
					{ label: 'Sales orders', href: '/sales/orders' },
					{ label: order.orderNumber }
				]}
				action={
					isDraft && canTransact ? (
						<>
							<Link
								href={`/sales/orders/${order.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
							<TransitionControls
								salesOrderId={order.id}
								orderNumber={order.orderNumber}
								revision={order.revision}
							/>
						</>
					) : null
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<SalesOrderStateBadge state={order.state} />
				{!isDraft && (
					<span className="text-sm text-muted-foreground">
						This order is read-only. Its commercial lines are frozen.
					</span>
				)}
			</div>

			{isConfirmed && (
				<WorkSurface
					title="Fulfilment"
					description="Delivery moves quantity. Only a posted invoice reaches the ledger."
				>
					<div className="flex flex-col gap-5">
						{order.delivery == null ? (
							canTransact ? (
								<DeliveryControl
									salesOrderId={order.id}
									revision={order.revision}
									orderDate={order.orderDate}
									hasStockLines={hasStockLines}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									This order has not been delivered yet.
								</p>
							)
						) : (
							<p className="text-sm">
								Delivered on {formatBusinessDate(order.delivery.deliveryDate)} as{' '}
								<Link
									href={`/sales/deliveries/${order.delivery.id}`}
									className="text-accent hover:underline"
								>
									{order.delivery.deliveryNumber}
								</Link>
								.
							</p>
						)}

						{order.customerInvoice == null ? (
							canTransact ? (
								<InvoiceControl
									salesOrderId={order.id}
									revision={order.revision}
									orderDate={order.orderDate}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									No customer invoice has been generated for this order.
								</p>
							)
						) : (
							<p className="text-sm">
								Invoiced as{' '}
								<Link
									href={`/sales/invoices/${order.customerInvoice.id}`}
									className="text-accent hover:underline"
								>
									{order.customerInvoice.invoiceNumber}
								</Link>
								.
							</p>
						)}
					</div>
				</WorkSurface>
			)}

			<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
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

				<WorkSurface title="Totals">
					<dl className="flex flex-col gap-2 text-sm">
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Net</dt>
							<dd className="tabular-nums">{formatAmount(order.netTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Tax</dt>
							<dd className="tabular-nums">{formatAmount(order.taxTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
							<dt className="font-semibold">Gross</dt>
							<dd className="text-lg font-semibold tabular-nums">{formatAmount(order.total)}</dd>
						</div>
					</dl>
				</WorkSurface>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Sales order lines"
					columns={columns}
					rows={order.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
