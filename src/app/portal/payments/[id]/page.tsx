import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { PortalPaymentDetail } from '@/lib/contracts/portal'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getPortalPayment } from '@/server/portal'
import { PortalPaymentStatusBadge } from '@/app/portal/portal-presentation'

type Allocation = PortalPaymentDetail['allocations'][number]

export const dynamic = 'force-dynamic'

export default async function PortalPaymentPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getPortalPayment(actor, { paymentId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const payment = result.data

	const columns: readonly TableColumn<Allocation>[] = [
		{
			id: 'document',
			header: 'Applied to',
			cell: (allocation) =>
				allocation.document.kind === 'CUSTOMER_INVOICE' ? (
					<Link
						href={`/portal/invoices/${allocation.document.id}`}
						className="text-accent hover:underline"
					>
						{allocation.document.number}
					</Link>
				) : (
					allocation.document.number
				)
		},
		{
			id: 'amount',
			header: 'Amount',
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
			header: 'Reversed',
			cell: (allocation) =>
				allocation.reversalDate == null ? (
					<span className="text-muted-foreground">No</span>
				) : (
					`${formatAmount(allocation.reversedAmount)} on ${formatBusinessDate(allocation.reversalDate)}`
				)
		}
	]

	return (
		<>
			<PageHeader
				title={payment.number}
				lead="Payment receipt"
				breadcrumbs={[{ label: 'Portal', href: '/portal' }, { label: payment.number }]}
				action={
					<Link
						href={`/api/payments/${payment.id}/receipt.pdf`}
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Download receipt
					</Link>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<PortalPaymentStatusBadge status={payment.status} />
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
				<WorkSurface title="Receipt">
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Payment date
							</dt>
							<dd className="mt-0.5 text-sm">{formatBusinessDate(payment.paymentDate)}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Reference
							</dt>
							<dd className="mt-0.5 text-sm">{payment.reference ?? '-'}</dd>
						</div>
						{payment.reversalDate != null && (
							<div>
								<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
									Reversed on
								</dt>
								<dd className="mt-0.5 text-sm">{formatBusinessDate(payment.reversalDate)}</dd>
							</div>
						)}
					</dl>
				</WorkSurface>

				<WorkSurface title="Amount">
					<p className="text-2xl font-semibold tabular-nums">{formatAmount(payment.amount)}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Recorded inside UrbanLedger. No real money was transferred.
					</p>
				</WorkSurface>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Applied amounts"
					columns={columns}
					rows={payment.allocations}
					getRowKey={(allocation) => allocation.id}
				/>
			</div>
		</>
	)
}
