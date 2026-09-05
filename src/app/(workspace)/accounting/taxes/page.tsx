import { Suspense } from 'react'
import Link from 'next/link'
import { Percent, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/state-panel'
import { trimMoneyScale } from '@/lib/format'
import {
	taxScopes,
	taxSortColumns,
	TAX_SCOPE_LABELS,
	TAX_SORT_LABELS,
	type TaxSummary
} from '@/lib/masters/tax'
import { getActor } from '@/server/auth/actor'
import { listTaxes } from '@/server/masters/taxes'

const PAGE_SIZE = 20

type TaxParams = {
	q?: string
	scope?: string
	archived?: string
	sort?: string
	dir?: string
	page?: string
}

function buildHref(params: TaxParams, patch: TaxParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/accounting/taxes' : `/accounting/taxes?${queryString}`
}

async function TaxesTable({ params }: { params: TaxParams }) {
	const actor = await getActor()
	const result = await listTaxes(actor, {
		search: params.q ?? '',
		scope: (params.scope as 'ALL') ?? 'ALL',
		includeArchived: params.archived === 'include',
		sort: params.sort as 'name',
		direction: params.dir === 'desc' ? 'desc' : 'asc',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const columns: readonly TableColumn<TaxSummary>[] = [
		{ id: 'name', header: 'Name', cell: (tax) => tax.name },
		{
			id: 'rate',
			header: 'Rate',
			isNumeric: true,
			cell: (tax) => `${trimMoneyScale(tax.rate, 0)}%`
		},
		{
			id: 'scope',
			header: 'Scope',
			cell: (tax) => <Badge tone="accent">{TAX_SCOPE_LABELS[tax.scope]}</Badge>
		},
		{
			id: 'accounts',
			header: 'Mapped accounts',
			cell: (tax) =>
				[tax.inputAccount?.code, tax.outputAccount?.code].filter(Boolean).join(', ') || '-'
		},
		{
			id: 'status',
			header: 'Status',
			cell: (tax) =>
				tax.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Taxes"
				columns={columns}
				rows={result.rows}
				getRowKey={(tax) => tax.id}
				getRowHref={(tax) => `/accounting/taxes/${tax.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Percent}
							title={(params.q ?? '') === '' ? 'No taxes yet' : 'No taxes match these filters'}
							description="A tax maps a percentage to the accounts its amounts post against."
						/>
					</div>
				}
			/>
			{result.rows.length > 0 && (
				<Pagination
					page={result.page}
					pageSize={result.pageSize}
					totalCount={result.totalCount}
					itemNoun="taxes"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function TaxesPage({ searchParams }: { searchParams: Promise<TaxParams> }) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Taxes"
				lead="Configurable percentage taxes and the accounts they post to."
				action={
					actor.capabilities.includes('masters:create') ? (
						<Link href="/accounting/taxes/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New tax
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/accounting/taxes"
				searchLabel="Search taxes"
				searchPlaceholder="Tax name"
				searchDefaultValue={params.q ?? ''}
				resetHref="/accounting/taxes"
			>
				<ToolbarFilter
					label="Scope"
					name="scope"
					defaultValue={params.scope ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All scopes' },
						...taxScopes.map((value) => ({ value, label: TAX_SCOPE_LABELS[value] }))
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
					options={taxSortColumns.map((value) => ({ value, label: TAX_SORT_LABELS[value] }))}
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
				key={`${params.q}|${params.scope}|${params.archived}|${params.sort}|${params.dir}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={5} />}
			>
				<TaxesTable params={params} />
			</Suspense>
		</>
	)
}
