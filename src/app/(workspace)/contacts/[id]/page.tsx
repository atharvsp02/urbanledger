import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-panel'
import { CONTACT_KIND_LABELS } from '@/lib/masters/contact'
import { formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getContactImage } from '@/server/masters/contact-images'
import { getContactDetail } from '@/server/masters/contacts'
import { ApplicationError } from '@/server/errors/application-error'
import { ArchiveControl } from '@/app/(workspace)/contacts/[id]/archive-control'
import { ContactImage } from '@/app/(workspace)/contacts/[id]/contact-image'
import { PortalStateBadge } from '@/app/(workspace)/contacts/portal-state-badge'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	let contact

	try {
		contact = await getContactDetail(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const image = await getContactImage(id)
	const canUpdate = actor.capabilities.includes('contacts:update')
	const canArchive = actor.capabilities.includes('masters:archive')

	const details: readonly { label: string; value: string }[] = [
		{ label: 'Type', value: CONTACT_KIND_LABELS[contact.kind] },
		{ label: 'Email', value: contact.email ?? '-' },
		{ label: 'Mobile', value: contact.mobile ?? '-' },
		{ label: 'Address', value: contact.street ?? '-' },
		{ label: 'City', value: contact.city ?? '-' },
		{ label: 'State', value: contact.state ?? '-' },
		{ label: 'Pincode', value: contact.pincode ?? '-' }
	]

	return (
		<>
			<PageHeader
				title={contact.name}
				breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: contact.name }]}
				action={
					<>
						{canUpdate && (
							<Link
								href={`/contacts/${contact.id}/edit`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Edit
							</Link>
						)}
						{canArchive && (
							<ArchiveControl
								contactId={contact.id}
								contactName={contact.name}
								revision={contact.revision}
								isArchived={contact.archivedAt != null}
							/>
						)}
					</>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge tone={contact.kind === 'VENDOR' ? 'neutral' : 'accent'}>
					{CONTACT_KIND_LABELS[contact.kind]}
				</Badge>
				<PortalStateBadge state={contact.portalState} />
				{contact.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived on {formatBusinessDate(contact.archivedAt)}</Badge>
				)}
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
				<WorkSurface title="Details">
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
						{details.map((detail) => (
							<div key={detail.label}>
								<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
									{detail.label}
								</dt>
								<dd className="mt-0.5 text-sm break-words">{detail.value}</dd>
							</div>
						))}
					</dl>
				</WorkSurface>

				<WorkSurface title="Profile image">
					<ContactImage
						contactId={contact.id}
						contactName={contact.name}
						imageUrl={image?.url ?? null}
						canEdit={canUpdate}
					/>
				</WorkSurface>
			</div>

			<WorkSurface title="Related documents">
				<EmptyState
					icon={FileText}
					title="No documents yet"
					description="Sales orders, invoices, bills and payments for this contact appear here once those workflows are built."
				/>
			</WorkSurface>
		</>
	)
}
