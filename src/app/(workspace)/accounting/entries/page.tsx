import { Suspense } from 'react'
import Link from 'next/link'
import { BookOpenCheck, Plus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarDate, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { JOURNAL_ENTRY_SOURCE_LABELS, JOURNAL_ENTRY_STATUS_LABELS } from '@/lib/accounting/display'
import {
	journalEntrySources,
	type JournalEntryListInput,
	type JournalEntrySummary,
	type JournalEntryStatus
} from '@/lib/contracts/accounting'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listJournalEntries } from '@/server/accounting'

const PAGE_SIZE = 20

type EntryParams = {
	source?: string
	from?: string
	to?: string
	page?: string
}

function buildHref(params: EntryParams, page: number) {
	const query = new URLSearchParams()

	if (params.source) query.set('source', params.source)
	if (params.from) query.set('from', params.from)
	if (params.to) query.set('to', params.to)
	if (page > 1) query.set('page', String(page))

	const queryString = query.toString()
	return queryString ? `/accounting/entries?${queryString}` : '/accounting/entries'
}

function statusTone(status: JournalEntryStatus): BadgeTone {
	if (status === 'POSTED') return 'success'
	if (status === 'REVERSED' || status === 'REVERSAL') return 'warning'
	return 'neutral'
}

async function EntriesTable({
	actor,
	params
}: {
	actor: Awaited<ReturnType<typeof getActor>>
	params: EntryParams
}) {
	const result = await listJournalEntries(actor, {
		source: (params.source || 'ALL') as JournalEntryListInput['source'],
		dateFrom: params.from || undefined,
		dateTo: params.to || undefined,
		page: Number(params.page || '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) {
		return result.error.code === 'FORBIDDEN' ? (
			<ForbiddenState description={result.error.message} />
		) : (
			<ErrorState description={result.error.message} />
		)
	}

	const columns: readonly TableColumn<JournalEntrySummary>[] = [
		{ id: 'reference', header: 'Reference', cell: (entry) => entry.reference },
		{
			id: 'date',
			header: 'Posting date',
			cell: (entry) => formatBusinessDate(entry.postingDate)
		},
		{
			id: 'journal',
			header: 'Journal',
			cell: (entry) => `${entry.journal.code} ${entry.journal.name}`
		},
		{
			id: 'source',
			header: 'Source',
			cell: (entry) => JOURNAL_ENTRY_SOURCE_LABELS[entry.source]
		},
		{
			id: 'status',
			header: 'Status',
			cell: (entry) => (
				<Badge tone={statusTone(entry.status)}>{JOURNAL_ENTRY_STATUS_LABELS[entry.status]}</Badge>
			)
		},
		{
			id: 'debit',
			header: 'Debit',
			isNumeric: true,
			cell: (entry) => formatAmount(entry.totalDebit)
		},
		{
			id: 'credit',
			header: 'Credit',
			isNumeric: true,
			cell: (entry) => formatAmount(entry.totalCredit)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Journal entries"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(entry) => entry.id}
				getRowHref={(entry) => `/accounting/entries/${entry.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={BookOpenCheck}
							title="No journal entries match these filters"
							description="Post a manual or opening journal, or clear the date and source filters."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="entries"
					buildHref={(page) => buildHref(params, page)}
				/>
			)}
		</div>
	)
}

export default async function JournalEntriesPage({
	searchParams
}: {
	searchParams: Promise<EntryParams>
}) {
	const params = await searchParams
	const actor = await getActor()

	return (
		<>
			<PageHeader
				title="Journal entries"
				lead="Posted accounting activity and its complete debit and credit lines."
				action={
					actor.capabilities.includes('transactions:post') ? (
						<Link href="/accounting/entries/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New journal entry
						</Link>
					) : null
				}
			/>

			<ListToolbar
				action="/accounting/entries"
				hasSearch={false}
				searchLabel="Filter journal entries"
				resetHref="/accounting/entries"
			>
				<ToolbarFilter
					label="Source"
					name="source"
					defaultValue={params.source || 'ALL'}
					options={[
						{ value: 'ALL', label: 'All sources' },
						...journalEntrySources.map((source) => ({
							value: source,
							label: JOURNAL_ENTRY_SOURCE_LABELS[source]
						}))
					]}
				/>
				<ToolbarDate label="From" name="from" defaultValue={params.from} />
				<ToolbarDate label="To" name="to" defaultValue={params.to} />
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={7} />}>
				<EntriesTable actor={actor} params={params} />
			</Suspense>
		</>
	)
}
