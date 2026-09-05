import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { fieldControlClassName } from '@/components/ui/field'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { JOURNAL_ENTRY_SOURCE_LABELS, JOURNAL_ENTRY_STATUS_LABELS } from '@/lib/accounting/display'
import type { JournalEntrySummary } from '@/lib/contracts/accounting'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import {
	JOURNAL_REQUIREMENTS,
	JOURNAL_TYPE_HINTS,
	JOURNAL_TYPE_LABELS
} from '@/lib/masters/journal'
import { getActor } from '@/server/auth/actor'
import { getJournalActivity } from '@/server/accounting'
import { getJournalDetail } from '@/server/masters/journals'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/accounting/journals/[id]/archive-control'

const PAGE_SIZE = 20

type ActivityParams = { from?: string; to?: string; page?: string }

function activityHref(journalId: string, params: ActivityParams, page: number) {
	const query = new URLSearchParams()

	if (params.from) query.set('from', params.from)
	if (params.to) query.set('to', params.to)
	if (page > 1) query.set('page', String(page))

	const queryString = query.toString()
	return queryString
		? `/accounting/journals/${journalId}?${queryString}`
		: `/accounting/journals/${journalId}`
}

export default async function JournalDetailPage({
	params,
	searchParams
}: {
	params: Promise<{ id: string }>
	searchParams: Promise<ActivityParams>
}) {
	const { id } = await params
	const filters = await searchParams
	const actor = await getActor()
	let journal

	try {
		journal = await getJournalDetail(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const canUpdate = actor.capabilities.includes('masters:update')
	const canArchive = actor.capabilities.includes('masters:archive')
	const requirements = JOURNAL_REQUIREMENTS[journal.type]
	const accountFor = {
		defaultIncomeAccountId: journal.defaultIncomeAccount,
		defaultExpenseAccountId: journal.defaultExpenseAccount,
		defaultControlAccountId: journal.defaultControlAccount,
		defaultLiquidityAccountId: journal.defaultLiquidityAccount
	}
	const activityResult = await getJournalActivity(actor, {
		journalId: id,
		dateFrom: filters.from || undefined,
		dateTo: filters.to || undefined,
		page: Number(filters.page || '1') || 1,
		pageSize: PAGE_SIZE
	})
	const activityColumns: readonly TableColumn<JournalEntrySummary>[] = [
		{
			id: 'date',
			header: 'Entry date',
			cell: (entry) => formatBusinessDate(entry.postingDate)
		},
		{ id: 'reference', header: 'Reference', cell: (entry) => entry.reference },
		{
			id: 'source',
			header: 'Source',
			cell: (entry) => JOURNAL_ENTRY_SOURCE_LABELS[entry.source]
		},
		{
			id: 'state',
			header: 'State',
			cell: (entry) => JOURNAL_ENTRY_STATUS_LABELS[entry.status]
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
		<>
			<PageHeader
				title={`${journal.code} ${journal.name}`}
				breadcrumbs={[{ label: 'Journals', href: '/accounting/journals' }, { label: journal.code }]}
				action={
					<>
						{canUpdate && (
							<Link
								href={`/accounting/journals/${journal.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
						)}
						{canArchive && (
							<ArchiveControl
								journalId={journal.id}
								journalName={journal.name}
								revision={journal.revision}
								isArchived={journal.archivedAt != null}
							/>
						)}
					</>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge tone="accent">{JOURNAL_TYPE_LABELS[journal.type]}</Badge>
				{journal.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived on {formatBusinessDate(journal.archivedAt)}</Badge>
				)}
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
				<WorkSurface title="Default accounts" description={JOURNAL_TYPE_HINTS[journal.type]}>
					{requirements.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{JOURNAL_TYPE_LABELS[journal.type]} journals need no default account mapping.
						</p>
					) : (
						<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
							{requirements.map((requirement) => {
								const account = accountFor[requirement.field]

								return (
									<div key={requirement.field}>
										<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
											{requirement.label}
										</dt>
										<dd className="mt-0.5 text-sm">
											{account == null ? (
												<span className="text-muted-foreground">Not set</span>
											) : (
												<Link
													href={`/accounting/accounts/${account.id}`}
													className="text-accent hover:underline"
												>
													{account.code} {account.name}
												</Link>
											)}
										</dd>
									</div>
								)
							})}
						</dl>
					)}
				</WorkSurface>

				<WorkSurface title="Usage">
					<dl className="grid gap-3">
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Posted entries
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">{journal.entryCount}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Journal type
							</dt>
							<dd className="mt-0.5 text-sm">
								{journal.entryCount > 0 ? 'Fixed by posted entries' : 'Editable'}
							</dd>
						</div>
					</dl>
				</WorkSurface>
			</div>

			{activityResult.ok ? (
				<>
					<div className="grid gap-4 sm:grid-cols-3">
						<WorkSurface title="All posted entries">
							<p className="text-2xl font-semibold tabular-nums">
								{activityResult.data.postedEntryCount}
							</p>
						</WorkSurface>
						<WorkSurface title="All posted debits">
							<p className="text-2xl font-semibold tabular-nums">
								{formatAmount(activityResult.data.totalDebit)}
							</p>
						</WorkSurface>
						<WorkSurface title="All posted credits">
							<p className="text-2xl font-semibold tabular-nums">
								{formatAmount(activityResult.data.totalCredit)}
							</p>
						</WorkSurface>
					</div>

					<form
						method="get"
						action={`/accounting/journals/${journal.id}`}
						aria-label="Filter journal activity"
						className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
					>
						<label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
							From
							<input
								type="date"
								name="from"
								defaultValue={filters.from}
								className={fieldControlClassName}
							/>
						</label>
						<label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
							To
							<input
								type="date"
								name="to"
								defaultValue={filters.to}
								className={fieldControlClassName}
							/>
						</label>
						<div className="flex flex-wrap gap-2">
							<button type="submit" className={buttonVariants({ size: 'sm' })}>
								Apply
							</button>
							<Link
								href={`/accounting/journals/${journal.id}`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Clear
							</Link>
						</div>
					</form>

					<WorkSurface title="Posted entry activity" isFlush>
						<div className="rounded-xl bg-surface">
							<DataTable
								caption={`Posted activity for ${journal.code} ${journal.name}`}
								columns={activityColumns}
								rows={activityResult.data.rows}
								getRowKey={(entry) => entry.id}
								getRowHref={(entry) => `/accounting/entries/${entry.id}`}
								emptyState={
									<div className="p-5">
										<EmptyState
											title="No posted journal entries"
											description={
												filters.from || filters.to
													? 'No posted entries match this date range.'
													: 'This journal has no posted entries yet.'
											}
										/>
									</div>
								}
							/>
							{activityResult.data.rows.length > 0 && (
								<Pagination
									page={activityResult.data.page}
									pageSize={activityResult.data.pageSize}
									totalCount={activityResult.data.totalCount}
									itemNoun="entries"
									buildHref={(page) => activityHref(journal.id, filters, page)}
								/>
							)}
						</div>
					</WorkSurface>
				</>
			) : activityResult.error.code === 'FORBIDDEN' ? (
				<ForbiddenState description={activityResult.error.message} />
			) : (
				<ErrorState description={activityResult.error.message} />
			)}
		</>
	)
}
