import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { fieldControlClassName } from '@/components/ui/field'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { BALANCE_DIRECTION_LABELS } from '@/lib/accounting/display'
import type { AccountActivityRow } from '@/lib/contracts/accounting'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { ACCOUNT_SUBTYPE_LABELS, ACCOUNT_TYPE_LABELS } from '@/lib/masters/ledger-account'
import { getAccountActivity } from '@/server/accounting'
import { getActor } from '@/server/auth/actor'
import { getLedgerAccountDetail } from '@/server/masters/ledger-accounts'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/accounting/accounts/[id]/archive-control'

const PAGE_SIZE = 20

type ActivityParams = { from?: string; to?: string; page?: string }

function activityHref(accountId: string, params: ActivityParams, page: number) {
	const query = new URLSearchParams()

	if (params.from) query.set('from', params.from)
	if (params.to) query.set('to', params.to)
	if (page > 1) query.set('page', String(page))

	const queryString = query.toString()
	return queryString
		? `/accounting/accounts/${accountId}?${queryString}`
		: `/accounting/accounts/${accountId}`
}

export default async function LedgerAccountDetailPage({
	params,
	searchParams
}: {
	params: Promise<{ id: string }>
	searchParams: Promise<ActivityParams>
}) {
	const { id } = await params
	const filters = await searchParams
	const actor = await getActor()
	let account

	try {
		account = await getLedgerAccountDetail(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const canUpdate = actor.capabilities.includes('masters:update')
	const canArchive = actor.capabilities.includes('masters:archive')
	const isDefaultSomewhere =
		account.defaultOfJournals.length > 0 || account.defaultOfTaxes.length > 0
	const activityResult = await getAccountActivity(actor, {
		accountId: id,
		dateFrom: filters.from || undefined,
		dateTo: filters.to || undefined,
		page: Number(filters.page || '1') || 1,
		pageSize: PAGE_SIZE
	})
	const activityColumns: readonly TableColumn<AccountActivityRow>[] = [
		{
			id: 'date',
			header: 'Date',
			cell: (row) => formatBusinessDate(row.postingDate)
		},
		{
			id: 'journal',
			header: 'Journal',
			cell: (row) => (
				<Link
					href={`/accounting/journals/${row.journal.id}`}
					className="text-accent hover:underline"
				>
					{row.journal.code}
				</Link>
			)
		},
		{ id: 'reference', header: 'Reference', cell: (row) => row.reference },
		{
			id: 'description',
			header: 'Description',
			cell: (row) => row.description ?? <span className="text-muted-foreground">None</span>
		},
		{
			id: 'contact',
			header: 'Contact',
			cell: (row) =>
				row.contact ? (
					<Link href={`/contacts/${row.contact.id}`} className="text-accent hover:underline">
						{row.contact.name}
					</Link>
				) : (
					<span className="text-muted-foreground">None</span>
				)
		},
		{ id: 'debit', header: 'Debit', isNumeric: true, cell: (row) => formatAmount(row.debit) },
		{ id: 'credit', header: 'Credit', isNumeric: true, cell: (row) => formatAmount(row.credit) }
	]

	return (
		<>
			<PageHeader
				title={`${account.code} ${account.name}`}
				breadcrumbs={[
					{ label: 'Chart of accounts', href: '/accounting/accounts' },
					{ label: account.code }
				]}
				action={
					<>
						{canUpdate && (
							<Link
								href={`/accounting/accounts/${account.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
						)}
						{canArchive && (
							<ArchiveControl
								accountId={account.id}
								accountName={account.name}
								revision={account.revision}
								isArchived={account.archivedAt != null}
								isBlocked={isDefaultSomewhere}
							/>
						)}
					</>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge tone="accent">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
				<Badge>{ACCOUNT_SUBTYPE_LABELS[account.subtype]}</Badge>
				{account.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived on {formatBusinessDate(account.archivedAt)}</Badge>
				)}
			</div>

			{isDefaultSomewhere && account.archivedAt == null && (
				<p className="rounded-xl border border-border bg-surface-soft p-3 text-sm text-muted-foreground">
					This account is a configured default. Replace it on the journals and taxes below before
					archiving it.
				</p>
			)}

			<div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
				<WorkSurface title="Usage">
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Posted journal items
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">{account.journalItemCount}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Classification
							</dt>
							<dd className="mt-0.5 text-sm">
								{account.journalItemCount > 0 ? 'Fixed by posted entries' : 'Editable'}
							</dd>
						</div>
					</dl>
				</WorkSurface>

				<WorkSurface title="Configured as a default">
					{isDefaultSomewhere ? (
						<ul className="flex list-none flex-col gap-2 p-0 text-sm">
							{account.defaultOfJournals.map((journal) => (
								<li key={journal.id}>
									<Link
										href={`/accounting/journals/${journal.id}`}
										className="text-accent hover:underline"
									>
										{journal.code} {journal.name}
									</Link>
								</li>
							))}
							{account.defaultOfTaxes.map((tax) => (
								<li key={tax.id} className="text-muted-foreground">
									Tax: {tax.name}
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">
							No journal or tax uses this account as a default.
						</p>
					)}
				</WorkSurface>
			</div>

			{activityResult.ok ? (
				<>
					<div className="grid gap-4 sm:grid-cols-3">
						<WorkSurface title="Current posted balance">
							<p className="text-2xl font-semibold tabular-nums">
								{formatAmount(activityResult.data.currentBalance)}{' '}
								<span className="text-base text-muted-foreground">
									{BALANCE_DIRECTION_LABELS[activityResult.data.direction]}
								</span>
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
						action={`/accounting/accounts/${account.id}`}
						aria-label="Filter account activity"
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
								href={`/accounting/accounts/${account.id}`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Clear
							</Link>
						</div>
					</form>

					<WorkSurface title="Posted transaction activity" isFlush>
						<div className="rounded-xl bg-surface">
							<DataTable
								caption={`Posted activity for ${account.code} ${account.name}`}
								columns={activityColumns}
								rows={activityResult.data.rows}
								getRowKey={(row) => row.itemId}
								getRowHref={(row) => `/accounting/entries/${row.entryId}`}
								emptyState={
									<div className="p-5">
										<EmptyState
											title="No posted activity"
											description={
												filters.from || filters.to
													? 'No posted journal items match this date range.'
													: 'This account has a zero balance because no posted entries use it.'
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
									itemNoun="journal items"
									buildHref={(page) => activityHref(account.id, filters, page)}
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
