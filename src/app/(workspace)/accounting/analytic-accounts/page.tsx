import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Tags } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/state-panel'
import {
	analyticSortColumns,
	analyticTypes,
	ANALYTIC_SORT_LABELS,
	ANALYTIC_TYPE_LABELS,
	type AnalyticAccountSummary
} from '@/lib/masters/analytic-account'
import { getActor } from '@/server/auth/actor'
import { listAnalyticAccounts } from '@/server/masters/analytic-accounts'

const PAGE_SIZE = 20

type AnalyticParams = {
	q?: string
	type?: string
	archived?: string
	sort?: string
	dir?: string
	page?: string
}

function buildHref(params: AnalyticParams, patch: AnalyticParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === ''
		? '/accounting/analytic-accounts'
		: `/accounting/analytic-accounts?${queryString}`
}

async function AnalyticAccountsTable({ params }: { params: AnalyticParams }) {
	const actor = await getActor()
	const result = await listAnalyticAccounts(actor, {
		search: params.q ?? '',
		type: (params.type as 'ALL') ?? 'ALL',
		includeArchived: params.archived === 'include',
		sort: params.sort as 'name',
		direction: params.dir === 'desc' ? 'desc' : 'asc',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const columns: readonly TableColumn<AnalyticAccountSummary>[] = [
		{ id: 'name', header: 'Name', cell: (account) => account.name },
		{
			id: 'type',
			header: 'Type',
			cell: (account) => <Badge tone="accent">{ANALYTIC_TYPE_LABELS[account.type]}</Badge>
		},
		{
			id: 'status',
			header: 'Status',
			cell: (account) =>
				account.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Analytic accounts"
				columns={columns}
				rows={result.rows}
				getRowKey={(account) => account.id}
				getRowHref={(account) => `/accounting/analytic-accounts/${account.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Tags}
							title={
								(params.q ?? '') === ''
									? 'No analytic accounts yet'
									: 'No analytic accounts match these filters'
							}
							description="Analytic accounts group income and expense movements for budgeting."
						/>
					</div>
				}
			/>
			{result.rows.length > 0 && (
				<Pagination
					page={result.page}
					pageSize={result.pageSize}
					totalCount={result.totalCount}
					itemNoun="analytic accounts"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function AnalyticAccountsPage({
	searchParams
}: {
	searchParams: Promise<AnalyticParams>
}) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Analytic accounts"
				lead="Groupings used by budgets and tagged ledger movements."
				action={
					actor.capabilities.includes('masters:create') ? (
						<Link
							href="/accounting/analytic-accounts/new"
							className={buttonVariants({ size: 'sm' })}
						>
							<Plus aria-hidden="true" className="size-4" />
							New analytic account
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/accounting/analytic-accounts"
				searchLabel="Search analytic accounts"
				searchPlaceholder="Name"
				searchDefaultValue={params.q ?? ''}
				resetHref="/accounting/analytic-accounts"
			>
				<ToolbarFilter
					label="Type"
					name="type"
					defaultValue={params.type ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All types' },
						...analyticTypes.map((value) => ({ value, label: ANALYTIC_TYPE_LABELS[value] }))
					]}
				/>
				<ToolbarFilter
					label="Archived"
					name="archived"
					defaultValue={params.archived === 'include' ? 'include' : 'exclude'}
					options={[
						{ value: 'exclude', label: 'Active only' },
						{ value: 'include', label: 'Include archived' }
					]}
				/>
				<ToolbarFilter
					label="Sort by"
					name="sort"
					defaultValue={params.sort ?? 'name'}
					options={analyticSortColumns.map((value) => ({
						value,
						label: ANALYTIC_SORT_LABELS[value]
					}))}
				/>
				<ToolbarFilter
					label="Order"
					name="dir"
					defaultValue={params.dir === 'desc' ? 'desc' : 'asc'}
					options={[
						{ value: 'asc', label: 'Ascending' },
						{ value: 'desc', label: 'Descending' }
					]}
				/>
			</ListToolbar>

			<Suspense
				key={`${params.q}|${params.type}|${params.archived}|${params.sort}|${params.dir}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={3} />}
			>
				<AnalyticAccountsTable params={params} />
			</Suspense>
		</>
	)
}
