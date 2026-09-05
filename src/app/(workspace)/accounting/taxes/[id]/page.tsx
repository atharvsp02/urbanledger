import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { formatBusinessDate, trimMoneyScale } from '@/lib/format'
import { TAX_REQUIREMENTS, TAX_SCOPE_HINTS, TAX_SCOPE_LABELS } from '@/lib/masters/tax'
import { getActor } from '@/server/auth/actor'
import { getTax } from '@/server/masters/taxes'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/accounting/taxes/[id]/archive-control'

export default async function TaxDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	let tax

	try {
		tax = await getTax(actor, id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const canUpdate = actor.capabilities.includes('masters:update')
	const canArchive = actor.capabilities.includes('masters:archive')
	const accountFor = { inputAccountId: tax.inputAccount, outputAccountId: tax.outputAccount }

	return (
		<>
			<PageHeader
				title={tax.name}
				breadcrumbs={[{ label: 'Taxes', href: '/accounting/taxes' }, { label: tax.name }]}
				action={
					<>
						{canUpdate && (
							<Link
								href={`/accounting/taxes/${tax.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
						)}
						{canArchive && (
							<ArchiveControl
								taxId={tax.id}
								taxName={tax.name}
								revision={tax.revision}
								isArchived={tax.archivedAt != null}
							/>
						)}
					</>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge tone="accent">{TAX_SCOPE_LABELS[tax.scope]}</Badge>
				{tax.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived on {formatBusinessDate(tax.archivedAt)}</Badge>
				)}
			</div>

			<div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
				<WorkSurface title="Rate">
					<p className="text-2xl font-semibold tabular-nums">{trimMoneyScale(tax.rate, 0)}%</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Applied to the rounded net amount of each line.
					</p>
				</WorkSurface>

				<WorkSurface title="Mapped accounts" description={TAX_SCOPE_HINTS[tax.scope]}>
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
						{TAX_REQUIREMENTS[tax.scope].map((requirement) => {
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
				</WorkSurface>
			</div>
		</>
	)
}
