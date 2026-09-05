import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { PaymentDetail } from '@/lib/contracts/payment'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getPayment } from '@/server/payments'
import {
	PaymentDirectionBadge,
	PaymentStatusBadge
} from '@/app/(workspace)/payments/payment-presentation'
import { PaymentReversalControl } from '@/app/(workspace)/payments/[id]/reversal-control'

type Allocation = PaymentDetail['allocations'][number]

function documentHref(allocation: Allocation) {
	return allocation.document.kind === 'CUSTOMER_INVOICE'
		? `/sales/invoices/${allocation.document.id}`
		: `/purchases/bills/${allocation.document.id}`
}

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getPayment(actor, { paymentId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const payment = result.data
	const canReverse =
		payment.status === 'POSTED' && actor.capabilities.includes('transactions:reverse')
	const today = canReverse ? await getBusinessToday(actor) : payment.paymentDate

	const columns: readonly TableColumn<Allocation>[] = [
		{
			id: 'document',
			header: 'Document',
			cell: (allocation) => (
				<Link href={documentHref(allocation)} className="text-accent hover:underline">
					{allocation.document.number}
				</Link>
			)
		},
		{
			id: 'kind',
			header: 'Type',
			cell: (allocation) =>
				allocation.document.kind === 'CUSTOMER_INVOICE' ? 'Customer invoice' : 'Vendor bill'
		},
		{
			id: 'amount',
			header: 'Applied',
			isNumeric: true,
			cell: (allocation) => formatAmount(allocation.amount)
		},
		{
			id: 'effectiveDate',
			header: 'Effective',
			cell: (allocation) => formatBusinessDate(allocation.effectiveDate)
		},
		{
			id: 'reversal',
			header: 'Reversal',
			cell: (allocation) =>
				allocation.reversal == null ? (
					<span className="text-muted-foreground">None</span>
				) : (
					`${formatAmount(allocation.reversal.amount)} on ${formatBusinessDate(allocation.reversal.effectiveDate)}`
				)
		}
	]

	const details: readonly { label: string; value: React.ReactNode }[] = [
		{
			label: 'Contact',
			value: (
				<Link href={`/contacts/${payment.contact.id}`} className="text-accent hover:underline">
					{payment.contact.name}
				</Link>
			)
		},
		{ label: 'Payment date', value: formatBusinessDate(payment.paymentDate) },
		{ label: 'Method', value: `${payment.journal.code} ${payment.journal.name}` },
		{ label: 'Reference', value: payment.reference ?? '-' },
		{
			label: 'Source',
			value: payment.sourceMode === 'STAFF' ? 'Staff recorded' : 'Portal simulation'
		},
		{ label: 'Recorded by', value: payment.createdBy.displayName }
	]

	return (
		<>
			<PageHeader
				title={payment.paymentNumber}
				lead={payment.contact.name}
				breadcrumbs={[{ label: 'Payments', href: '/payments' }, { label: payment.paymentNumber }]}
				action={
					<Link
						href={`/api/payments/${payment.id}/receipt.pdf`}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-surface-hover"
					>
						Download receipt
					</Link>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<PaymentDirectionBadge direction={payment.direction} />
				<PaymentStatusBadge status={payment.status} />
				{payment.sourceMode === 'PORTAL_SIMULATION' && (
					<span className="text-sm text-muted-foreground">
						Recorded through the portal payment simulator. No real money moved.
					</span>
				)}
			</div>

			{payment.status === 'REVERSED' && (
				<p className="rounded-xl border border-danger/25 bg-danger/6 p-3 text-sm">
					Reversed on{' '}
					{payment.reversalDate == null ? '-' : formatBusinessDate(payment.reversalDate)}
					{payment.reversalReason == null ? '' : `: ${payment.reversalReason}`}. The original entry
					stays in the ledger as history.
				</p>
			)}

			<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
				<WorkSurface title="Payment">
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

				<WorkSurface title="Amount">
					<p className="text-2xl font-semibold tabular-nums">{formatAmount(payment.amount)}</p>
					<dl className="mt-3 flex flex-col gap-2 text-sm">
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Journal entry</dt>
							<dd>
								<Link
									href={`/accounting/entries/${payment.journalEntry.id}`}
									className="text-accent hover:underline"
								>
									{payment.journalEntry.reference}
								</Link>
							</dd>
						</div>
						{payment.reversalEntry != null && (
							<div className="flex items-baseline justify-between gap-4">
								<dt className="text-muted-foreground">Reversal entry</dt>
								<dd>
									<Link
										href={`/accounting/entries/${payment.reversalEntry.id}`}
										className="text-accent hover:underline"
									>
										{payment.reversalEntry.reference}
									</Link>
								</dd>
							</div>
						)}
					</dl>
				</WorkSurface>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Allocations"
					columns={columns}
					rows={payment.allocations}
					getRowKey={(allocation) => allocation.id}
				/>
			</div>

			{canReverse && (
				<WorkSurface
					title="Reverse this payment"
					description="Reversal appends an opposite entry and an allocation reversal. The original payment and its receipt number stay in history."
				>
					<PaymentReversalControl
						paymentId={payment.id}
						revision={payment.revision}
						today={today}
					/>
				</WorkSurface>
			)}
		</>
	)
}
