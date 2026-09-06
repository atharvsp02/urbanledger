import { Suspense } from 'react'
import Link from 'next/link'
import { BookOpen, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter, ToolbarSort } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/state-panel'
import {
	accountSortColumns,
	accountTypes,
	ACCOUNT_SORT_LABELS,
	ACCOUNT_SUBTYPE_LABELS,
	ACCOUNT_TYPE_LABELS,
	type LedgerAccountSummary
} from '@/lib/masters/ledger-account'
import { getActor } from '@/server/auth/actor'
import { listLedgerAccounts } from '@/server/masters/ledger-accounts'

const PAGE_SIZE = 20

type AccountParams = {
	q?: string
	type?: string
	archived?: string
	sort?: string
	dir?: string
	page?: string
}

function buildHref(params: AccountParams, patch: AccountParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/accounting/accounts' : `/accounting/accounts?${queryString}`
}

async function AccountsTable({ params }: { params: AccountParams }) {
	const result = await listLedgerAccounts({
		search: params.q ?? '',
		type: (params.type as 'ALL') ?? 'ALL',
		includeArchived: params.archived === 'include',
		sort: params.sort as 'code',
		direction: params.dir === 'desc' ? 'desc' : 'asc',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const columns: readonly TableColumn<LedgerAccountSummary>[] = [
		{ id: 'code', header: 'Code', cell: (account) => account.code },
		{ id: 'name', header: 'Name', cell: (account) => account.name },
		{
			id: 'type',
			header: 'Classification',
			cell: (account) => <Badge tone="accent">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
		},
		{
			id: 'subtype',
			header: 'Subtype',
			cell: (account) => ACCOUNT_SUBTYPE_LABELS[account.subtype]
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
				caption="Chart of accounts"
				columns={columns}
				rows={result.rows}
				getRowKey={(account) => account.id}
				getRowHref={(account) => `/accounting/accounts/${account.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={BookOpen}
							title={
								(params.q ?? '') === '' ? 'No accounts yet' : 'No accounts match these filters'
							}
							description={
								(params.q ?? '') === ''
									? 'Add the ledger accounts this business posts to.'
									: 'Clear the search or choose a different classification.'
							}
						/>
					</div>
				}
			/>
			{result.rows.length > 0 && (
				<Pagination
					page={result.page}
					pageSize={result.pageSize}
					totalCount={result.totalCount}
					itemNoun="accounts"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function LedgerAccountsPage({
	searchParams
}: {
	searchParams: Promise<AccountParams>
}) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Chart of accounts"
				lead="The ledger accounts every posted entry uses."
				action={
					actor.capabilities.includes('masters:create') ? (
						<Link href="/accounting/accounts/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New account
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/accounting/accounts"
				searchLabel="Search accounts"
				searchPlaceholder="Code or name"
				searchDefaultValue={params.q ?? ''}
				resetHref="/accounting/accounts"
			>
				<ToolbarFilter
					label="Classification"
					name="type"
					defaultValue={params.type ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All classifications' },
						...accountTypes.map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }))
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
				<ToolbarSort
					defaultSort={params.sort ?? 'code'}
					defaultDirection={params.dir === 'desc' ? 'desc' : 'asc'}
					options={accountSortColumns.map((value) => ({
						value,
						label: ACCOUNT_SORT_LABELS[value]
					}))}
				/>
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={5} />}>
				<AccountsTable params={params} />
			</Suspense>
		</>
	)
}
