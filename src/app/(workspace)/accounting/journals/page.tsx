import Link from 'next/link'
import { NotebookPen, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter, ToolbarSort } from '@/components/ui/list-toolbar'
import { EmptyState } from '@/components/ui/state-panel'
import {
	journalSortColumns,
	journalTypes,
	JOURNAL_SORT_LABELS,
	JOURNAL_TYPE_LABELS,
	type JournalSummary
} from '@/lib/masters/journal'
import { getActor } from '@/server/auth/actor'
import { listJournals } from '@/server/masters/journals'

type JournalParams = { type?: string; archived?: string; sort?: string; dir?: string }

function defaultsOf(journal: JournalSummary) {
	return [
		journal.defaultIncomeAccount,
		journal.defaultExpenseAccount,
		journal.defaultControlAccount,
		journal.defaultLiquidityAccount
	]
		.filter((account) => account != null)
		.map((account) => account.code)
}

export default async function JournalsPage({
	searchParams
}: {
	searchParams: Promise<JournalParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const journals = await listJournals({
		type: (params.type as 'ALL') ?? 'ALL',
		includeArchived: params.archived === 'include',
		sort: params.sort as 'code',
		direction: params.dir === 'desc' ? 'desc' : 'asc'
	})

	const columns: readonly TableColumn<JournalSummary>[] = [
		{ id: 'code', header: 'Code', cell: (journal) => journal.code },
		{ id: 'name', header: 'Name', cell: (journal) => journal.name },
		{
			id: 'type',
			header: 'Type',
			cell: (journal) => <Badge tone="accent">{JOURNAL_TYPE_LABELS[journal.type]}</Badge>
		},
		{
			id: 'defaults',
			header: 'Default accounts',
			cell: (journal) => {
				const codes = defaultsOf(journal)
				return codes.length === 0 ? 'None required' : codes.join(', ')
			}
		},
		{
			id: 'status',
			header: 'Status',
			cell: (journal) =>
				journal.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<>
			<PageHeader
				title="Journals"
				lead="Each journal decides which accounts its documents post against."
				action={
					actor.capabilities.includes('masters:create') ? (
						<Link href="/accounting/journals/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New journal
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/accounting/journals"
				hasSearch={false}
				searchLabel="Filter journals"
				resetHref="/accounting/journals"
			>
				<ToolbarFilter
					label="Type"
					name="type"
					defaultValue={params.type ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All types' },
						...journalTypes.map((value) => ({ value, label: JOURNAL_TYPE_LABELS[value] }))
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
					options={journalSortColumns.map((value) => ({
						value,
						label: JOURNAL_SORT_LABELS[value]
					}))}
				/>
			</ListToolbar>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Journals"
					columns={columns}
					rows={journals}
					getRowKey={(journal) => journal.id}
					getRowHref={(journal) => `/accounting/journals/${journal.id}`}
					emptyState={
						<div className="p-5">
							<EmptyState
								icon={NotebookPen}
								title="No journals match these filters"
								description="Sales, purchase, bank and cash journals connect documents to the ledger."
							/>
						</div>
					}
				/>
			</div>
		</>
	)
}
