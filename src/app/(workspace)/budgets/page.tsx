import { Suspense } from 'react'
import Link from 'next/link'
import { PiggyBank, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { BudgetSummary } from '@/lib/contracts/budget'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listBudgets } from '@/server/budgets'

const PAGE_SIZE = 20

type BudgetParams = { q?: string; archived?: string; page?: string }

function buildHref(params: BudgetParams, patch: BudgetParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/budgets' : `/budgets?${queryString}`
}

async function BudgetsTable({ params }: { params: BudgetParams }) {
	const actor = await getActor()
	const result = await listBudgets(actor, {
		search: params.q ?? '',
		includeArchived: params.archived === 'include',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<BudgetSummary>[] = [
		{ id: 'name', header: 'Budget', cell: (budget) => budget.name },
		{
			id: 'period',
			header: 'Period',
			cell: (budget) =>
				`${formatBusinessDate(budget.startsOn)} - ${formatBusinessDate(budget.endsOn)}`
		},
		{ id: 'responsible', header: 'Responsible', cell: (budget) => budget.responsible.name },
		{ id: 'lineCount', header: 'Lines', isNumeric: true, cell: (budget) => budget.lineCount },
		{
			id: 'plannedTotal',
			header: 'Planned',
			isNumeric: true,
			cell: (budget) => formatAmount(budget.plannedTotal)
		},
		{
			id: 'status',
			header: 'Status',
			cell: (budget) =>
				budget.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Budgets"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(budget) => budget.id}
				getRowHref={(budget) => `/budgets/${budget.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={PiggyBank}
							title="No budgets match these filters"
							description="A budget plans amounts per analytic account for a date period."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="budgets"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function BudgetsPage({
	searchParams
}: {
	searchParams: Promise<BudgetParams>
}) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Budgets"
				lead="Planned amounts per analytic account. Actuals come from posted ledger movements."
				action={
					<>
						<Link
							href="/reports/budget"
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Budget report
						</Link>
						{actor.capabilities.includes('masters:create') && (
							<Link href="/budgets/new" className={buttonVariants({ size: 'sm' })}>
								<Plus aria-hidden="true" className="size-4" />
								New budget
							</Link>
						)}
					</>
				}
			/>

			<ListToolbar
				action="/budgets"
				searchLabel="Search budgets"
				searchPlaceholder="Budget name"
				searchDefaultValue={params.q ?? ''}
				resetHref="/budgets"
			>
				<ToolbarFilter
					label="Archived"
					name="archived"
					defaultValue={params.archived === 'include' ? 'include' : 'exclude'}
					options={[
						{ value: 'exclude', label: 'Active only' },
						{ value: 'include', label: 'Include archived' }
					]}
				/>
			</ListToolbar>

			<Suspense
				key={`${params.q}|${params.archived}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={6} />}
			>
				<BudgetsTable params={params} />
			</Suspense>
		</>
	)
}
