import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { JOURNAL_ENTRY_SOURCE_LABELS, JOURNAL_ENTRY_STATUS_LABELS } from '@/lib/accounting/display'
import type { JournalEntryLine, JournalEntryStatus } from '@/lib/contracts/accounting'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getJournalEntry } from '@/server/accounting'
import { getActor } from '@/server/auth/actor'
import { ReversalForm } from '@/app/(workspace)/accounting/entries/[id]/reversal-form'

function statusTone(status: JournalEntryStatus): BadgeTone {
	if (status === 'POSTED') return 'success'
	if (status === 'REVERSED' || status === 'REVERSAL') return 'warning'
	return 'neutral'
}

export default async function JournalEntryDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getJournalEntry(actor, { entryId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND' || result.error.code === 'VALIDATION_ERROR') notFound()

		return result.error.code === 'FORBIDDEN' ? (
			<ForbiddenState titleAs="h1" description={result.error.message} />
		) : (
			<ErrorState titleAs="h1" description={result.error.message} />
		)
	}

	const entry = result.data
	const canReverse =
		actor.capabilities.includes('transactions:reverse') &&
		entry.state === 'POSTED' &&
		entry.source !== 'REVERSAL' &&
		entry.reversalEntry == null
	const columns: readonly TableColumn<JournalEntryLine>[] = [
		{
			id: 'account',
			header: 'Account',
			cell: (line) => `${line.account.code} ${line.account.name}`
		},
		{
			id: 'description',
			header: 'Description',
			cell: (line) => line.description ?? <span className="text-muted-foreground">None</span>
		},
		{
			id: 'contact',
			header: 'Contact',
			cell: (line) =>
				line.contact ? (
					<Link href={`/contacts/${line.contact.id}`} className="text-accent hover:underline">
						{line.contact.name}
					</Link>
				) : (
					<span className="text-muted-foreground">None</span>
				)
		},
		{
			id: 'analytic',
			header: 'Analytic account',
			cell: (line) =>
				line.analyticAccount?.name ?? <span className="text-muted-foreground">None</span>
		},
		{
			id: 'debit',
			header: 'Debit',
			isNumeric: true,
			cell: (line) => formatAmount(line.debit)
		},
		{
			id: 'credit',
			header: 'Credit',
			isNumeric: true,
			cell: (line) => formatAmount(line.credit)
		}
	]

	return (
		<>
			<PageHeader
				title={entry.reference}
				lead="A committed double-entry posting. Its lines cannot be edited or deleted."
				breadcrumbs={[
					{ label: 'Journal entries', href: '/accounting/entries' },
					{ label: entry.reference }
				]}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge tone={statusTone(entry.status)}>{JOURNAL_ENTRY_STATUS_LABELS[entry.status]}</Badge>
				<Badge tone="accent">{JOURNAL_ENTRY_SOURCE_LABELS[entry.source]}</Badge>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<WorkSurface title="Posting">
					<dl className="grid gap-3 text-sm">
						<div>
							<dt className="text-muted-foreground">Posting date</dt>
							<dd className="mt-0.5 font-medium">{formatBusinessDate(entry.postingDate)}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Reference</dt>
							<dd className="mt-0.5 font-medium">{entry.reference}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Created by</dt>
							<dd className="mt-0.5 font-medium">{entry.createdBy.displayName}</dd>
						</div>
					</dl>
				</WorkSurface>
				<WorkSurface title="Journal">
					<Link
						href={`/accounting/journals/${entry.journal.id}`}
						className="text-sm font-medium text-accent hover:underline"
					>
						{entry.journal.code} {entry.journal.name}
					</Link>
					<p className="mt-2 text-sm text-muted-foreground">
						{JOURNAL_ENTRY_SOURCE_LABELS[entry.source]} source
					</p>
				</WorkSurface>
				<WorkSurface title="Balanced totals">
					<dl className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<dt className="text-muted-foreground">Debit</dt>
							<dd className="mt-0.5 font-semibold tabular-nums">
								{formatAmount(entry.totalDebit)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Credit</dt>
							<dd className="mt-0.5 font-semibold tabular-nums">
								{formatAmount(entry.totalCredit)}
							</dd>
						</div>
					</dl>
				</WorkSurface>
			</div>

			{entry.originalEntry && (
				<p className="rounded-xl border border-warning/25 bg-warning/6 p-4 text-sm">
					This entry reverses{' '}
					<Link
						href={`/accounting/entries/${entry.originalEntry.id}`}
						className="font-medium text-accent hover:underline"
					>
						{entry.originalEntry.reference}
					</Link>
					.
				</p>
			)}

			{entry.reversalEntry && (
				<p className="rounded-xl border border-warning/25 bg-warning/6 p-4 text-sm">
					This entry was reversed by{' '}
					<Link
						href={`/accounting/entries/${entry.reversalEntry.id}`}
						className="font-medium text-accent hover:underline"
					>
						{entry.reversalEntry.reference}
					</Link>
					.
				</p>
			)}

			<WorkSurface title="Journal items" description="Every posted debit and credit line." isFlush>
				<DataTable
					caption={`Journal items for ${entry.reference}`}
					columns={columns}
					rows={entry.lines}
					getRowKey={(line) => line.id}
					getRowHref={(line) => `/accounting/accounts/${line.account.id}`}
				/>
			</WorkSurface>

			{canReverse && (
				<ReversalForm
					entryId={entry.id}
					minimumDate={entry.postingDate}
					defaultDate={new Date().toISOString().slice(0, 10)}
					operationKey={randomUUID()}
				/>
			)}
		</>
	)
}
