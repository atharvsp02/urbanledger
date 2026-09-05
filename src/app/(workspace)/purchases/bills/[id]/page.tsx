import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { VendorBillDetail } from '@/lib/contracts/vendor-bill'
import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getDocumentPaymentHistory, getPaymentOptions } from '@/server/payments'
import { SettlementPanel } from '@/app/(workspace)/payments/settlement-panel'
import { DocumentReversalControl } from '@/app/(workspace)/payments/document-reversal-control'
import { getVendorBill, getVendorBillOptions } from '@/server/purchasing'
import { BillStateBadge } from '@/app/(workspace)/purchases/bills/bill-state-badge'
import { DraftBillControls } from '@/app/(workspace)/purchases/bills/[id]/bill-controls'

type BillLine = VendorBillDetail['lines'][number]

export default async function VendorBillDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getVendorBill(actor, { vendorBillId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const bill = result.data
	const isDraft = bill.state === 'DRAFT'
	const canTransact = actor.capabilities.includes('transactions:create')
	const options = isDraft && canTransact ? await getVendorBillOptions(actor) : null
	const isPosted = bill.state === 'POSTED'
	const canPay = actor.capabilities.includes('payments:record')
	const canReverse = actor.capabilities.includes('transactions:reverse')
	const history = isPosted ? await getDocumentPaymentHistory(actor, { documentId: bill.id }) : null
	const paymentOptions =
		isPosted && canPay ? await getPaymentOptions(actor, { documentId: bill.id }) : null
	const today = isPosted ? await getBusinessToday(actor) : bill.billDate

	const columns: readonly TableColumn<BillLine>[] = [
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
			id: 'net',
			header: 'Net',
			isNumeric: true,
			cell: (line) => formatAmount(line.lineNetTotal)
		},
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
			header: 'Line total',
			isNumeric: true,
			cell: (line) => formatAmount(line.lineTotal)
		}
	]

	const details: readonly { label: string; value: React.ReactNode }[] = [
		{ label: 'Vendor', value: bill.vendor.name },
		{
			label: 'Purchase order',
			value: (
				<Link
					href={`/purchases/orders/${bill.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{bill.sourceOrder.orderNumber}
				</Link>
			)
		},
		{ label: 'Bill date', value: formatBusinessDate(bill.billDate) },
		{ label: 'Due date', value: formatBusinessDate(bill.dueDate) },
		{ label: 'Vendor reference', value: bill.vendorReference ?? '-' },
		{ label: 'Created by', value: bill.createdBy.displayName }
	]

	return (
		<>
			<PageHeader
				title={bill.billNumber}
				lead={bill.vendor.name}
				breadcrumbs={[
					{ label: 'Vendor bills', href: '/purchases/bills' },
					{ label: bill.billNumber }
				]}
				action={
					isDraft && canTransact ? (
						<Link
							href={`/purchases/bills/${bill.id}/edit`}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Edit
						</Link>
					) : null
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<BillStateBadge state={bill.state} />
				{bill.state === 'POSTED' && bill.journalEntry != null && (
					<span className="text-sm text-muted-foreground">
						Posted to{' '}
						<Link
							href={`/accounting/entries/${bill.journalEntry.id}`}
							className="text-accent hover:underline"
						>
							{bill.journalEntry.reference}
						</Link>
						.
					</span>
				)}
				{bill.state === 'CANCELLED' && (
					<span className="text-sm text-muted-foreground">
						Cancelled drafts have no accounting effect and cannot be edited.
					</span>
				)}
			</div>

			{isDraft && canTransact && options?.ok === true && (
				<WorkSurface
					title="Post this bill"
					description="Posting is the only step that reaches the ledger."
				>
					<DraftBillControls
						vendorBillId={bill.id}
						billNumber={bill.billNumber}
						revision={bill.revision}
						purchaseJournals={options.data.purchaseJournals}
					/>
				</WorkSurface>
			)}

			{isPosted && history?.ok === true && (
				<SettlementPanel
					history={history.data}
					options={paymentOptions?.ok === true ? paymentOptions.data : null}
					direction="VENDOR_OUTGOING"
					documentRevision={bill.revision}
					documentPath={`/purchases/bills/${bill.id}`}
					today={today}
					canRecordPayment={canPay}
				/>
			)}

			<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
				<WorkSurface title="Bill">
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
							<dd className="tabular-nums">{formatAmount(bill.netTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Tax</dt>
							<dd className="tabular-nums">{formatAmount(bill.taxTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
							<dt className="font-semibold">Total</dt>
							<dd className="text-lg font-semibold tabular-nums">{formatAmount(bill.total)}</dd>
						</div>
					</dl>
				</WorkSurface>
			</div>

			{isPosted && canReverse && (
				<WorkSurface
					title="Reverse this bill"
					description="Reverse live payments first. Reversal appends an opposite entry at an allowed date."
				>
					<DocumentReversalControl
						documentId={bill.id}
						documentKind="VENDOR_BILL"
						documentPath={`/purchases/bills/${bill.id}`}
						revision={bill.revision}
						today={today}
					/>
				</WorkSurface>
			)}

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Vendor bill lines"
					columns={columns}
					rows={bill.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
