import Link from 'next/link'
import { Scale } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { fieldControlClassName } from '@/components/ui/field'
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { BALANCE_DIRECTION_LABELS, signedBalance } from '@/lib/accounting/display'
import type { TrialBalanceRow } from '@/lib/contracts/accounting'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { ACCOUNT_TYPE_LABELS } from '@/lib/masters/ledger-account'
import { getTrialBalance } from '@/server/accounting'
import { getActor } from '@/server/auth/actor'

type TrialBalanceParams = { asOf?: string }

export default async function TrialBalancePage({
	searchParams
}: {
	searchParams: Promise<TrialBalanceParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const defaultDate = new Date().toISOString().slice(0, 10)
	const asOfDate = params.asOf || defaultDate
	const result = await getTrialBalance(actor, { asOfDate })
	const columns: readonly TableColumn<TrialBalanceRow>[] = [
		{ id: 'code', header: 'Account', cell: (row) => row.accountCode },
		{ id: 'name', header: 'Name', cell: (row) => row.accountName },
		{
			id: 'type',
			header: 'Classification',
			cell: (row) => ACCOUNT_TYPE_LABELS[row.accountType]
		},
		{ id: 'debit', header: 'Debit', isNumeric: true, cell: (row) => formatAmount(row.debit) },
		{ id: 'credit', header: 'Credit', isNumeric: true, cell: (row) => formatAmount(row.credit) },
		{
			id: 'balance',
			header: 'Net balance',
			isNumeric: true,
			cell: (row) => {
				const balance = signedBalance(row.balance)
				return `${formatAmount(balance.amount)} ${BALANCE_DIRECTION_LABELS[balance.direction]}`
			}
		}
	]

	return (
		<>
			<PageHeader
				title="Trial Balance"
				lead="Posted ledger balances through the selected accounting date."
			/>

			<form
				method="get"
				action="/reports/trial-balance"
				aria-label="Trial Balance date"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
			>
				<label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
					As of date
					<input
						type="date"
						name="asOf"
						defaultValue={asOfDate}
						required
						className={fieldControlClassName}
					/>
				</label>
				<button type="submit" className={buttonVariants({ size: 'sm' })}>
					Generate
				</button>
			</form>

			{result.ok ? (
				<>
					<div className="grid gap-4 sm:grid-cols-3">
						<WorkSurface title="Total debit">
							<p className="text-2xl font-semibold tabular-nums">
								{formatAmount(result.data.totalDebit)}
							</p>
						</WorkSurface>
						<WorkSurface title="Total credit">
							<p className="text-2xl font-semibold tabular-nums">
								{formatAmount(result.data.totalCredit)}
							</p>
						</WorkSurface>
						<WorkSurface title="Difference">
							<p className="text-2xl font-semibold tabular-nums">
								{formatAmount(signedBalance(result.data.difference).amount)}
							</p>
							<Badge tone={result.data.balanced ? 'success' : 'danger'} className="mt-2">
								{result.data.balanced ? 'Balanced' : 'Out of balance'}
							</Badge>
						</WorkSurface>
					</div>

					<p className="text-sm text-muted-foreground">
						Balances include only posted entries dated on or before{' '}
						<span className="font-medium text-foreground">
							{formatBusinessDate(result.data.asOfDate)}
						</span>
						. Later reversals do not change an earlier report.
					</p>

					<WorkSurface title="Account balances" isFlush>
						<DataTable
							caption={`Trial Balance as of ${result.data.asOfDate}`}
							columns={columns}
							rows={result.data.rows}
							getRowKey={(row) => row.accountId}
							getRowHref={(row) => `/accounting/accounts/${row.accountId}`}
							emptyState={
								<div className="p-5">
									<EmptyState
										icon={Scale}
										title="No posted balances"
										description="No posted journal entries exist on or before this date."
									/>
								</div>
							}
						/>
					</WorkSurface>
				</>
			) : result.error.code === 'FORBIDDEN' ? (
				<ForbiddenState description={result.error.message} />
			) : (
				<ErrorState description={result.error.message}>
					<Link
						href="/reports/trial-balance"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Use today
					</Link>
				</ErrorState>
			)}
		</>
	)
}
