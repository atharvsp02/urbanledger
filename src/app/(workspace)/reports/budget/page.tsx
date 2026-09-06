import { Suspense } from 'react'
import Link from 'next/link'
import { PiggyBank } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarDate, ToolbarFilter } from '@/components/ui/list-toolbar'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { BudgetReportLine } from '@/lib/contracts/budget'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBudgetReport, listBudgets } from '@/server/budgets'

type ReportParams = { budget?: string; from?: string; to?: string }

async function BudgetReportBody({ params }: { params: ReportParams }) {
	const actor = await getActor()

	const budgetId = params.budget ?? ''

	if (budgetId === '') {
		return (
			<EmptyState
				icon={PiggyBank}
				title="Choose a budget"
				description="Select a budget above to compare its planned amounts with posted activity."
			/>
		)
	}

	const result = await getBudgetReport(actor, {
		budgetId,
		dateFrom: params.from === '' ? undefined : params.from,
		dateTo: params.to === '' ? undefined : params.to
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const report = result.data

	const columns: readonly TableColumn<BudgetReportLine>[] = [
		{
			id: 'analytic',
			header: 'Analytic account',
			cell: (line) => (
				<Link
					href={`/accounting/analytic-accounts/${line.analyticAccount.id}`}
					className="text-accent hover:underline"
				>
					{line.analyticAccount.name}
				</Link>
			)
		},
		{
			id: 'type',
			header: 'Type',
			cell: (line) => (
				<Badge tone={line.analyticAccount.type === 'INCOME' ? 'success' : 'accent'}>
					{line.analyticAccount.type === 'INCOME' ? 'Income' : 'Expense'}
				</Badge>
			)
		},
		{
			id: 'planned',
			header: 'Planned',
			isNumeric: true,
			cell: (line) => formatAmount(line.plannedAmount)
		},
		{
			id: 'actual',
			header: 'Actual',
			isNumeric: true,
			cell: (line) => formatAmount(line.actualAmount)
		},
		{
			id: 'variance',
			header: 'Variance',
			isNumeric: true,
			cell: (line) => formatAmount(line.variance)
		},
		{
			id: 'utilization',
			header: 'Utilization',
			isNumeric: true,
			cell: (line) =>
				line.utilizationStatus === 'NO_PLAN' || line.utilizationPercent == null ? (
					<span className="text-muted-foreground">No plan</span>
				) : (
					`${line.utilizationPercent}%`
				)
		}
	]

	return (
		<>
			<WorkSurface
				title={report.budget.name}
				description={`Planned ${formatBusinessDate(report.budget.startsOn)} to ${formatBusinessDate(report.budget.endsOn)}. Reported ${formatBusinessDate(report.filter.dateFrom)} to ${formatBusinessDate(report.filter.dateTo)}.`}
			>
				<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Responsible
						</dt>
						<dd className="mt-0.5 text-sm">{report.budget.responsible.name}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Planned total
						</dt>
						<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(report.plannedTotal)}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Actual total
						</dt>
						<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(report.actualTotal)}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Variance
						</dt>
						<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(report.varianceTotal)}</dd>
					</div>
				</dl>
				<p className="mt-4 text-sm text-muted-foreground">
					Income lines count credit-minus-debit movement and Expense lines count debit-minus-credit,
					so a positive actual always means activity in the direction the analytic account
					represents. Variance is planned minus actual.
				</p>
			</WorkSurface>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption={`Budget performance for ${report.budget.name}`}
					columns={columns}
					rows={report.lines}
					getRowKey={(line) => line.id}
					emptyState={
						<div className="p-5">
							<EmptyState
								icon={PiggyBank}
								title="This budget has no lines"
								description="Add analytic lines to the budget to compare planned and actual amounts."
							/>
						</div>
					}
				/>
			</div>
		</>
	)
}

export default async function BudgetReportPage({
	searchParams
}: {
	searchParams: Promise<ReportParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const budgets = await listBudgets(actor, { pageSize: 100 })

	return (
		<>
			<PageHeader
				title="Budget report"
				lead="Planned amounts against posted analytic activity."
				breadcrumbs={[{ label: 'Reports' }, { label: 'Budget' }]}
				action={
					<Link href="/budgets" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
						Manage budgets
					</Link>
				}
			/>

			<ListToolbar
				action="/reports/budget"
				hasSearch={false}
				searchLabel="Filter budget report"
				resetHref="/reports/budget"
			>
				<ToolbarFilter
					label="Budget"
					name="budget"
					defaultValue={params.budget ?? ''}
					options={[
						{ value: '', label: 'Choose a budget' },
						...(budgets.ok
							? budgets.data.rows.map((budget) => ({ value: budget.id, label: budget.name }))
							: [])
					]}
				/>
				<ToolbarDate label="From" name="from" defaultValue={params.from ?? ''} />
				<ToolbarDate label="To" name="to" defaultValue={params.to ?? ''} />
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={6} />}>
				<BudgetReportBody params={params} />
			</Suspense>
		</>
	)
}
