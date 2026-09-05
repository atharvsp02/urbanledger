import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { formatBusinessDate } from '@/lib/format'
import { ACCOUNT_SUBTYPE_LABELS, ACCOUNT_TYPE_LABELS } from '@/lib/masters/ledger-account'
import { getActor } from '@/server/auth/actor'
import { getLedgerAccountDetail } from '@/server/masters/ledger-accounts'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/accounting/accounts/[id]/archive-control'

export default async function LedgerAccountDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
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
		</>
	)
}
