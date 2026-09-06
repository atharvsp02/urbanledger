import Link from 'next/link'
import { WorkSurface } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import type {
	DocumentPaymentHistory,
	PaymentOptions,
	PaymentSummary
} from '@/lib/contracts/payment'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import {
	PaymentDirectionBadge,
	PaymentStatusBadge,
	SettlementBadge
} from '@/app/(workspace)/payments/payment-presentation'
import { PaymentPanel } from '@/app/(workspace)/payments/payment-panel'

export function SettlementPanel({
	history,
	options,
	direction,
	documentRevision,
	documentPath,
	today,
	canRecordPayment
}: {
	history: DocumentPaymentHistory
	options: PaymentOptions | null
	direction: 'CUSTOMER_INCOMING' | 'VENDOR_OUTGOING'
	documentRevision: number
	documentPath: string
	today: string
	canRecordPayment: boolean
}) {
	const { settlement, payments } = history
	const isOverdue = Number(settlement.overdueAmount) > 0

	const columns: readonly TableColumn<PaymentSummary>[] = [
		{
			id: 'paymentNumber',
			header: 'Payment',
			cell: (payment) => (
				<Link href={`/payments/${payment.id}`} className="text-accent hover:underline">
					{payment.paymentNumber}
				</Link>
			)
		},
		{
			id: 'paymentDate',
			header: 'Date',
			cell: (payment) => formatBusinessDate(payment.paymentDate)
		},
		{
			id: 'direction',
			header: 'Direction',
			cell: (payment) => <PaymentDirectionBadge direction={payment.direction} />
		},
		{
			id: 'journal',
			header: 'Method',
			cell: (payment) => `${payment.journal.code} ${payment.journal.name}`
		},
		{
			id: 'status',
			header: 'Status',
			cell: (payment) => <PaymentStatusBadge status={payment.status} />
		},
		{
			id: 'amount',
			header: 'Amount',
			isNumeric: true,
			cell: (payment) => formatAmount(payment.amount)
		}
	]

	return (
		<>
			<WorkSurface
				title="Settlement"
				description={`As of ${formatBusinessDate(settlement.asOfDate)}.`}
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<SettlementBadge status={settlement.status} isOverdue={isOverdue} />
					</div>
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Document total
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">
								{formatAmount(settlement.document.total)}
							</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Paid
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(settlement.paidAmount)}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Outstanding
							</dt>
							<dd className="mt-0.5 text-sm font-semibold tabular-nums">
								{formatAmount(settlement.outstandingAmount)}
							</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Overdue
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">
								{formatAmount(settlement.overdueAmount)}
							</dd>
						</div>
					</dl>

					{canRecordPayment && options != null && settlement.status !== 'PAID' && (
						<div className="border-t border-border pt-4">
							<PaymentPanel
								options={options}
								direction={direction}
								documentRevision={documentRevision}
								documentPath={documentPath}
								today={today}
							/>
						</div>
					)}
				</div>
			</WorkSurface>

			{payments.length > 0 && (
				<div className="rounded-xl border border-border bg-surface">
					<DataTable
						caption="Payment history"
						isCaptionVisible
						columns={columns}
						rows={payments}
						getRowKey={(payment) => payment.id}
					/>
				</div>
			)}
		</>
	)
}
