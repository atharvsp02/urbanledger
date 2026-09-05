import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ContactForm } from '@/app/(workspace)/contacts/contact-form'
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'
import { getContact } from '@/server/dev-fixtures/contacts'

export const metadata: Metadata = { title: 'Edit contact' }

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const contact = getContact(id)
	if (contact == null) notFound()

	return (
		<>
			<PageHeader
				title={`Edit ${contact.name}`}
				lead="Changes apply to future documents. Posted documents keep the details they were issued with."
				breadcrumbs={[
					{ label: 'Contacts', href: '/contacts' },
					{ label: contact.name, href: `/contacts/${contact.id}` },
					{ label: 'Edit' }
				]}
			/>
			<FixtureNotice master="contacts" />
			<ContactForm contact={contact} />
		</>
	)
}
