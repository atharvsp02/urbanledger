import { Suspense } from 'react'
import Link from 'next/link'
import { PiggyBank } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { SelectInput, TextInput } from '@/components/ui/inputs'
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
	const variance = (Number(report.plannedTotal) - Number(report.actualTotal)).toFixed(2)

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
						<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(variance)}</dd>
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

			<form
				method="get"
				action="/reports/budget"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
			>
				<Field id="report-budget" label="Budget" className="min-w-56" isRequired>
					{(props) => (
						<SelectInput {...props} name="budget" defaultValue={params.budget ?? ''}>
							<option value="">Choose a budget</option>
							{budgets.ok &&
								budgets.data.rows.map((budget) => (
									<option key={budget.id} value={budget.id}>
										{budget.name}
									</option>
								))}
						</SelectInput>
					)}
				</Field>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="report-from" label="From" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="from" defaultValue={params.from ?? ''} />
						)}
					</Field>
					<Field id="report-to" label="To" inRow>
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
						href="/reports/budget"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Clear
					</Link>
				</div>
			</form>

			<Suspense
				key={`${params.budget}|${params.from}|${params.to}`}
				fallback={<SkeletonTable rows={6} columns={6} />}
			>
				<BudgetReportBody params={params} />
			</Suspense>
		</>
	)
}
