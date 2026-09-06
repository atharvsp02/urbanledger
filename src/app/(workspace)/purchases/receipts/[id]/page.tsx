import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { PurchaseReceiptDetail } from '@/lib/contracts/purchase-receipt'
import { formatBusinessDate, formatQuantity } from '@/lib/format'
import { PRODUCT_KIND_LABELS } from '@/lib/masters/product'
import { getActor } from '@/server/auth/actor'
import { getPurchaseReceipt } from '@/server/purchasing'

type ReceiptLine = PurchaseReceiptDetail['lines'][number]

export default async function PurchaseReceiptDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getPurchaseReceipt(actor, { purchaseReceiptId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const receipt = result.data
	const movesStock = (line: ReceiptLine) => line.productKind !== 'SERVICE'

	const columns: readonly TableColumn<ReceiptLine>[] = [
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
			cell: (line) => (movesStock(line) ? 'Quantity received' : 'Service accepted')
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
			label: 'Vendor',
			value: (
				<Link href={`/contacts/${receipt.vendor.id}`} className="text-accent hover:underline">
					{receipt.vendor.name}
				</Link>
			)
		},
		{ label: 'Receipt date', value: formatBusinessDate(receipt.receiptDate) },
		{ label: 'Recorded by', value: receipt.createdBy.displayName },
		{
			label: 'Purchase order',
			value: (
				<Link
					href={`/purchases/orders/${receipt.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{receipt.sourceOrder.orderNumber}
				</Link>
			)
		}
	]

	return (
		<>
			<PageHeader
				title={receipt.receiptNumber}
				lead={receipt.vendor.name}
				breadcrumbs={[
					{ label: 'Purchase receipts', href: '/purchases/receipts' },
					{ label: receipt.receiptNumber }
				]}
			/>

			<WorkSurface title="Receipt">
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
				Goods and Combo lines move quantity on hand. Service lines record acceptance only and never
				create a stock movement. A receipt makes no accounting entry; the vendor bill does that.
			</p>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Received and accepted lines"
					columns={columns}
					rows={receipt.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
