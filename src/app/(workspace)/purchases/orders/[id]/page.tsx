import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { PurchaseOrderLine } from '@/lib/contracts/purchase-order'
import { Badge } from '@/components/ui/badge'
import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { PRODUCT_KIND_LABELS } from '@/lib/masters/product'
import { getActor } from '@/server/auth/actor'
import { getPurchaseOrder } from '@/server/purchasing'
import { OrderStateBadge } from '@/app/(workspace)/purchases/orders/order-state-badge'
import { TransitionControls } from '@/app/(workspace)/purchases/orders/[id]/transition-controls'
import {
	ReceiptControl,
	VendorBillControl
} from '@/app/(workspace)/purchases/orders/[id]/fulfilment-controls'

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
	const isConfirmed = order.state === 'CONFIRMED'
	const hasGoodsLines = order.lines.some((line) => line.productKind !== 'SERVICE')

	const columns: readonly TableColumn<PurchaseOrderLine>[] = [
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
			id: 'lineTotal',
			header: 'Gross',
			isNumeric: true,
			cell: (line) => formatAmount(line.lineTotal)
		}
	]

	const details: readonly { label: string; value: React.ReactNode }[] = [
		{
			label: 'Vendor',
			value: (
				<Link href={`/contacts/${order.vendor.id}`} className="text-accent hover:underline">
					{order.vendor.name}
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

			{isConfirmed && (
				<WorkSurface
					title="Fulfilment"
					description="Receipts record arrival and acceptance. Only a posted vendor bill reaches the ledger."
				>
					<div className="flex flex-col gap-5">
						{order.receipt == null ? (
							canTransact ? (
								<ReceiptControl
									purchaseOrderId={order.id}
									revision={order.revision}
									orderDate={order.orderDate}
									hasGoodsLines={hasGoodsLines}
								/>
							) : (
								<p className="text-sm text-muted-foreground">
									This order has not been received yet.
								</p>
							)
						) : (
							<p className="text-sm">
								Received on {formatBusinessDate(order.receipt.receiptDate)} as{' '}
								<Link
									href={`/purchases/receipts/${order.receipt.id}`}
									className="text-accent hover:underline"
								>
									{order.receipt.receiptNumber}
								</Link>
								.
							</p>
						)}

						{order.receipt != null &&
							(order.vendorBill == null ? (
								canTransact ? (
									<VendorBillControl
										purchaseOrderId={order.id}
										revision={order.revision}
										receiptDate={order.receipt.receiptDate}
									/>
								) : (
									<p className="text-sm text-muted-foreground">
										No vendor bill has been generated for this order.
									</p>
								)
							) : (
								<p className="text-sm">
									Billed as{' '}
									<Link
										href={`/purchases/bills/${order.vendorBill.id}`}
										className="text-accent hover:underline"
									>
										{order.vendorBill.billNumber}
									</Link>
									.
								</p>
							))}
					</div>
				</WorkSurface>
			)}

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
