import { Suspense } from 'react'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import { paymentDirections, paymentStatuses, type PaymentSummary } from '@/lib/contracts/payment'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listPayments } from '@/server/payments'
import {
	DIRECTION_LABELS,
	PaymentDirectionBadge,
	PaymentStatusBadge
} from '@/app/(workspace)/payments/payment-presentation'

const PAGE_SIZE = 20

type PaymentParams = {
	direction?: string
	status?: string
	from?: string
	to?: string
	page?: string
}

function buildHref(params: PaymentParams, patch: PaymentParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/payments' : `/payments?${queryString}`
}

function documentHref(payment: PaymentSummary) {
	return payment.direction === 'CUSTOMER_INCOMING' ? '/sales/invoices' : '/purchases/bills'
}

async function PaymentsTable({ params }: { params: PaymentParams }) {
	const actor = await getActor()
	const result = await listPayments(actor, {
		direction: (params.direction as 'ALL') ?? 'ALL',
		status: (params.status as 'ALL') ?? 'ALL',
		dateFrom: params.from === '' ? undefined : params.from,
		dateTo: params.to === '' ? undefined : params.to,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<PaymentSummary>[] = [
		{ id: 'paymentNumber', header: 'Payment', cell: (payment) => payment.paymentNumber },
		{
			id: 'direction',
			header: 'Direction',
			cell: (payment) => <PaymentDirectionBadge direction={payment.direction} />
		},
		{ id: 'contact', header: 'Contact', cell: (payment) => payment.contact.name },
		{
			id: 'paymentDate',
			header: 'Date',
			cell: (payment) => formatBusinessDate(payment.paymentDate)
		},
		{
			id: 'journal',
			header: 'Method',
			cell: (payment) => `${payment.journal.code} ${payment.journal.name}`
		},
		{
			id: 'source',
			header: 'Source',
			cell: (payment) => (payment.sourceMode === 'STAFF' ? 'Staff' : 'Portal simulation')
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
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Payments"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(payment) => payment.id}
				getRowHref={(payment) => `/payments/${payment.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Wallet}
							title="No payments match these filters"
							description="Payments settle posted invoices and bills. Record one from the document it settles."
						>
							<Link
								href="/sales/invoices?state=POSTED"
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Posted invoices
							</Link>
						</EmptyState>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="payments"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function PaymentsPage({
	searchParams
}: {
	searchParams: Promise<PaymentParams>
}) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Payments"
				lead="Money received from customers and paid to vendors, with their ledger effect."
			/>

			<ListToolbar
				action="/payments"
				hasSearch={false}
				searchLabel="Filter payments"
				resetHref="/payments"
			>
				<ToolbarFilter
					label="Direction"
					name="direction"
					defaultValue={params.direction ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All directions' },
						...paymentDirections.map((value) => ({ value, label: DIRECTION_LABELS[value] }))
					]}
				/>
				<ToolbarFilter
					label="Status"
					name="status"
					defaultValue={params.status ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All statuses' },
						...paymentStatuses.map((value) => ({
							value,
							label: value === 'POSTED' ? 'Posted' : 'Reversed'
						}))
					]}
				/>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="payments-from" label="From" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="from" defaultValue={params.from ?? ''} />
						)}
					</Field>
					<Field id="payments-to" label="To" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="to" defaultValue={params.to ?? ''} />
						)}
					</Field>
				</FieldRow>
			</ListToolbar>

			<Suspense
				key={`${params.direction}|${params.status}|${params.from}|${params.to}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={8} />}
			>
				<PaymentsTable params={params} />
			</Suspense>
		</>
	)
}
