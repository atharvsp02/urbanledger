import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { formatBusinessDate } from '@/lib/format'
import {
	JOURNAL_REQUIREMENTS,
	JOURNAL_TYPE_HINTS,
	JOURNAL_TYPE_LABELS
} from '@/lib/masters/journal'
import { getActor } from '@/server/auth/actor'
import { getJournalDetail } from '@/server/masters/journals'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/accounting/journals/[id]/archive-control'

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
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
		</>
	)
}
