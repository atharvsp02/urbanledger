import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { CustomerInvoiceDetail } from '@/lib/contracts/customer-invoice'
import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getDocumentPaymentHistory, getPaymentOptions } from '@/server/payments'
import { SettlementPanel } from '@/app/(workspace)/payments/settlement-panel'
import { DocumentReversalControl } from '@/app/(workspace)/payments/document-reversal-control'
import { getCustomerInvoice, getCustomerInvoiceOptions } from '@/server/sales'
import { InvoiceStateBadge } from '@/app/(workspace)/sales/invoices/invoice-state-badge'
import { DraftInvoiceControls } from '@/app/(workspace)/sales/invoices/[id]/invoice-controls'

type InvoiceLine = CustomerInvoiceDetail['lines'][number]

export default async function CustomerInvoiceDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getCustomerInvoice(actor, { customerInvoiceId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const invoice = result.data
	const isDraft = invoice.state === 'DRAFT'
	const canTransact = actor.capabilities.includes('transactions:create')
	const options = isDraft && canTransact ? await getCustomerInvoiceOptions(actor) : null
	const isPosted = invoice.state === 'POSTED'
	const canPay = actor.capabilities.includes('payments:record')
	const canReverse = actor.capabilities.includes('transactions:reverse')
	const history = isPosted
		? await getDocumentPaymentHistory(actor, { documentId: invoice.id })
		: null
	const paymentOptions =
		isPosted && canPay ? await getPaymentOptions(actor, { documentId: invoice.id }) : null
	const today = isPosted ? await getBusinessToday(actor) : invoice.invoiceDate

	const columns: readonly TableColumn<InvoiceLine>[] = [
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
			header: 'Line total',
			isNumeric: true,
			cell: (line) => formatAmount(line.lineTotal)
		}
	]

	const details: readonly { label: string; value: React.ReactNode }[] = [
		{
			label: 'Customer',
			value: (
				<Link href={`/contacts/${invoice.customer.id}`} className="text-accent hover:underline">
					{invoice.customer.name}
				</Link>
			)
		},
		{
			label: 'Sales order',
			value: (
				<Link
					href={`/sales/orders/${invoice.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{invoice.sourceOrder.orderNumber}
				</Link>
			)
		},
		{ label: 'Invoice date', value: formatBusinessDate(invoice.invoiceDate) },
		{ label: 'Due date', value: formatBusinessDate(invoice.dueDate) },
		{ label: 'Reference', value: invoice.reference ?? '-' },
		{ label: 'Created by', value: invoice.createdBy.displayName }
	]

	return (
		<>
			<PageHeader
				title={invoice.invoiceNumber}
				lead={invoice.customer.name}
				breadcrumbs={[
					{ label: 'Customer invoices', href: '/sales/invoices' },
					{ label: invoice.invoiceNumber }
				]}
				action={
					isDraft && canTransact ? (
						<Link
							href={`/sales/invoices/${invoice.id}/edit`}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Edit
						</Link>
					) : null
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<InvoiceStateBadge state={invoice.state} />
				{invoice.state === 'POSTED' && invoice.journalEntry != null && (
					<span className="text-sm text-muted-foreground">
						Posted to{' '}
						<Link
							href={`/accounting/entries/${invoice.journalEntry.id}`}
							className="text-accent hover:underline"
						>
							{invoice.journalEntry.reference}
						</Link>
						.
					</span>
				)}
				{invoice.state === 'CANCELLED' && (
					<span className="text-sm text-muted-foreground">
						Cancelled drafts have no accounting effect and cannot be edited.
					</span>
				)}
			</div>

			{isDraft && canTransact && options?.ok === true && (
				<WorkSurface
					title="Post this invoice"
					description="Posting is the only step that reaches the ledger."
				>
					<DraftInvoiceControls
						customerInvoiceId={invoice.id}
						invoiceNumber={invoice.invoiceNumber}
						revision={invoice.revision}
						salesJournals={options.data.salesJournals}
					/>
				</WorkSurface>
			)}

			{isPosted && history?.ok === true && (
				<SettlementPanel
					history={history.data}
					options={paymentOptions?.ok === true ? paymentOptions.data : null}
					direction="CUSTOMER_INCOMING"
					documentRevision={invoice.revision}
					documentPath={`/sales/invoices/${invoice.id}`}
					today={today}
					canRecordPayment={canPay}
				/>
			)}

			<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
				<WorkSurface title="Invoice">
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
							<dd className="tabular-nums">{formatAmount(invoice.netTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Tax</dt>
							<dd className="tabular-nums">{formatAmount(invoice.taxTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
							<dt className="font-semibold">Total</dt>
							<dd className="text-lg font-semibold tabular-nums">{formatAmount(invoice.total)}</dd>
						</div>
					</dl>
				</WorkSurface>
			</div>

			{isPosted && canReverse && (
				<WorkSurface
					title="Reverse this invoice"
					description="Reverse live payments first. Reversal appends an opposite entry at an allowed date."
				>
					<DocumentReversalControl
						documentId={invoice.id}
						documentKind="CUSTOMER_INVOICE"
						documentPath={`/sales/invoices/${invoice.id}`}
						revision={invoice.revision}
						today={today}
					/>
				</WorkSurface>
			)}

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Customer invoice lines"
					columns={columns}
					rows={invoice.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
