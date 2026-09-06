import Link from 'next/link'
import { WorkSurface } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/state-panel'
import type { ReportAccountRow } from '@/lib/contracts/reports'
import { formatAmount } from '@/lib/format'

const columns: readonly TableColumn<ReportAccountRow>[] = [
	{
		id: 'account',
		header: 'Account',
		cell: (row) => (
			<Link href={`/accounting/accounts/${row.accountId}`} className="text-accent hover:underline">
				{row.accountCode} {row.accountName}
			</Link>
		)
	},
	{ id: 'amount', header: 'Amount', isNumeric: true, cell: (row) => formatAmount(row.amount) }
]

export function ReportSection({
	title,
	description,
	rows,
	total,
	totalLabel,
	emptyDescription,
	children
}: {
	title: string
	description?: string
	rows: readonly ReportAccountRow[]
	total: string
	totalLabel: string
	emptyDescription: string
	children?: React.ReactNode
}) {
	return (
		<WorkSurface title={title} description={description} isFlush>
			<DataTable
				caption={title}
				columns={columns}
				rows={rows}
				getRowKey={(row) => row.accountId}
				emptyState={
					<div className="p-5">
						<EmptyState title="No accounts with movement" description={emptyDescription} />
					</div>
				}
			/>
			{children}
			<div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-3">
				<span className="text-sm font-semibold">{totalLabel}</span>
				<span className="text-sm font-semibold tabular-nums">{formatAmount(total)}</span>
			</div>
		</WorkSurface>
	)
}
