import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState } from '@/components/ui/state-panel'
import type { BudgetLineDetail } from '@/lib/contracts/budget'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBudget } from '@/server/budgets'
import { ArchiveControl } from '@/app/(workspace)/budgets/[id]/archive-control'

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getBudget(actor, { budgetId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const budget = result.data
	const canUpdate = actor.capabilities.includes('masters:update')
	const canArchive = actor.capabilities.includes('masters:archive')

	const columns: readonly TableColumn<BudgetLineDetail>[] = [
		{ id: 'analytic', header: 'Analytic account', cell: (line) => line.analyticAccount.name },
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
		}
	]

	return (
		<>
			<PageHeader
				title={budget.name}
				lead={`${formatBusinessDate(budget.startsOn)} to ${formatBusinessDate(budget.endsOn)}`}
				breadcrumbs={[{ label: 'Budgets', href: '/budgets' }, { label: budget.name }]}
				action={
					<>
						<Link
							href={`/reports/budget?budget=${budget.id}`}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Performance
						</Link>
						{canUpdate && (
							<Link
								href={`/budgets/${budget.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
						)}
						{canArchive && (
							<ArchiveControl
								budgetId={budget.id}
								budgetName={budget.name}
								revision={budget.revision}
								isArchived={budget.archivedAt != null}
							/>
						)}
					</>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				{budget.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)}
				<span className="text-sm text-muted-foreground">
					Responsible: {budget.responsible.name}
				</span>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<WorkSurface title="Planned total">
					<p className="text-2xl font-semibold tabular-nums">{formatAmount(budget.plannedTotal)}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Plans are stored amounts, never actual transactions.
					</p>
				</WorkSurface>
				<WorkSurface title="Lines">
					<p className="text-2xl font-semibold tabular-nums">{budget.lineCount}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						One planned amount per analytic account.
					</p>
				</WorkSurface>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Budget lines"
					columns={columns}
					rows={budget.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
