import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { formatBusinessDate } from '@/lib/format'
import { ANALYTIC_TYPE_HINTS, ANALYTIC_TYPE_LABELS } from '@/lib/masters/analytic-account'
import { getActor } from '@/server/auth/actor'
import { getAnalyticAccountDetail } from '@/server/masters/analytic-accounts'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/accounting/analytic-accounts/[id]/archive-control'

export default async function AnalyticAccountDetailPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	let analyticAccount

	try {
		analyticAccount = await getAnalyticAccountDetail(actor, id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const canUpdate = actor.capabilities.includes('masters:update')
	const canArchive = actor.capabilities.includes('masters:archive')

	return (
		<>
			<PageHeader
				title={analyticAccount.name}
				breadcrumbs={[
					{ label: 'Analytic accounts', href: '/accounting/analytic-accounts' },
					{ label: analyticAccount.name }
				]}
				action={
					<>
						{canUpdate && (
							<Link
								href={`/accounting/analytic-accounts/${analyticAccount.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
						)}
						{canArchive && (
							<ArchiveControl
								analyticAccountId={analyticAccount.id}
								analyticAccountName={analyticAccount.name}
								revision={analyticAccount.revision}
								isArchived={analyticAccount.archivedAt != null}
							/>
						)}
					</>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge tone="accent">{ANALYTIC_TYPE_LABELS[analyticAccount.type]}</Badge>
				{analyticAccount.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived on {formatBusinessDate(analyticAccount.archivedAt)}</Badge>
				)}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<WorkSurface title="Usage">
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Journal items
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">{analyticAccount.journalItemCount}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Budget lines
							</dt>
							<dd className="mt-0.5 text-sm tabular-nums">{analyticAccount.budgetLineCount}</dd>
						</div>
					</dl>
					<p className="mt-3 text-sm text-muted-foreground">
						{analyticAccount.journalItemCount > 0
							? 'Type is fixed by posted journal items.'
							: 'Type is still editable.'}
					</p>
				</WorkSurface>

				<WorkSurface title="Type">
					<p className="text-sm">{ANALYTIC_TYPE_HINTS[analyticAccount.type]}</p>
				</WorkSurface>
			</div>
		</>
	)
}
