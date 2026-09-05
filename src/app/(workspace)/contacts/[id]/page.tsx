import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ContactAvatar } from '@/components/ui/placeholder'
import { EmptyState } from '@/components/ui/state-panel'
import { CONTACT_TYPE_LABELS } from '@/lib/masters/contact'
import { formatBusinessDate } from '@/lib/format'
import { getContact } from '@/server/dev-fixtures/contacts'
import { ArchiveControl } from '@/app/(workspace)/contacts/[id]/archive-control'
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const contact = getContact(id)
	if (contact == null) notFound()

	const details: readonly { label: string; value: string }[] = [
		{ label: 'Type', value: CONTACT_TYPE_LABELS[contact.type] },
		{ label: 'Email', value: contact.email },
		{ label: 'Mobile', value: contact.mobile },
		{ label: 'Address', value: contact.addressLine },
		{ label: 'City', value: contact.city },
		{ label: 'State', value: contact.state },
		{ label: 'Pincode', value: contact.pincode }
	]

	return (
		<>
			<PageHeader
				title={contact.name}
				breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: contact.name }]}
				action={
					<>
						<Link
							href={`/contacts/${contact.id}/edit`}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Edit
						</Link>
						<ArchiveControl
							contactId={contact.id}
							contactName={contact.name}
							isArchived={contact.archivedAt != null}
						/>
					</>
				}
			/>

			<FixtureNotice master="contacts" />

			<div className="flex flex-wrap items-center gap-3">
				<ContactAvatar name={contact.name} />
				<Badge tone={contact.type === 'vendor' ? 'neutral' : 'accent'}>
					{CONTACT_TYPE_LABELS[contact.type]}
				</Badge>
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

				<WorkSurface title="Related documents">
					<EmptyState
						icon={FileText}
						title="No documents yet"
						description="Sales orders, invoices, bills and payments for this contact appear here once those workflows are built."
					/>
				</WorkSurface>
			</div>
		</>
	)
}
