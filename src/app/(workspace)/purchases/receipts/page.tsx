import { Suspense } from 'react'
import { PackageCheck } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { PurchaseReceiptSummary } from '@/lib/contracts/purchase-receipt'
import { formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listPurchaseReceipts } from '@/server/purchasing'

const PAGE_SIZE = 20

type ReceiptParams = { from?: string; to?: string; page?: string }

function buildHref(params: ReceiptParams, patch: ReceiptParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/purchases/receipts' : `/purchases/receipts?${queryString}`
}

async function ReceiptsTable({ params }: { params: ReceiptParams }) {
	const actor = await getActor()
	const result = await listPurchaseReceipts(actor, {
		dateFrom: params.from === '' ? undefined : params.from,
		dateTo: params.to === '' ? undefined : params.to,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) {
		return <ErrorState description={result.error.message} />
	}

	const columns: readonly TableColumn<PurchaseReceiptSummary>[] = [
		{ id: 'receiptNumber', header: 'Receipt', cell: (receipt) => receipt.receiptNumber },
		{
			id: 'receiptDate',
			header: 'Receipt date',
			cell: (receipt) => formatBusinessDate(receipt.receiptDate)
		},
		{ id: 'vendor', header: 'Vendor', cell: (receipt) => receipt.vendor.name },
		{
			id: 'sourceOrder',
			header: 'Purchase order',
			cell: (receipt) => (
				<Link
					href={`/purchases/orders/${receipt.sourceOrder.id}`}
					className="text-accent hover:underline"
				>
					{receipt.sourceOrder.orderNumber}
				</Link>
			)
		},
		{ id: 'createdBy', header: 'Recorded by', cell: (receipt) => receipt.createdBy.displayName }
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Purchase receipts"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(receipt) => receipt.id}
				getRowHref={(receipt) => `/purchases/receipts/${receipt.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={PackageCheck}
							title="No receipts in this range"
							description="A receipt records goods arriving or services being accepted against a confirmed purchase order."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="receipts"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function PurchaseReceiptsPage({
	searchParams
}: {
	searchParams: Promise<ReceiptParams>
}) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Purchase receipts"
				lead="Physical arrival and service acceptance. Receipts change quantity, never the ledger."
			/>

			<form
				method="get"
				action="/purchases/receipts"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
			>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="receipts-from" label="From" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="from" defaultValue={params.from ?? ''} />
						)}
					</Field>
					<Field id="receipts-to" label="To" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="to" defaultValue={params.to ?? ''} />
						)}
					</Field>
				</FieldRow>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<Link
						href="/purchases/receipts"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Clear
					</Link>
				</div>
			</form>

			<Suspense
				key={`${params.from}|${params.to}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={5} />}
			>
				<ReceiptsTable params={params} />
			</Suspense>
		</>
	)
}
