import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ContactForm } from '@/app/(workspace)/contacts/contact-form'
import { getContactDetail } from '@/server/masters/contacts'
import { ApplicationError } from '@/server/errors/application-error'

export const metadata: Metadata = { title: 'Edit contact' }

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	let contact

	try {
		contact = await getContactDetail(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

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
			<ContactForm contact={contact} />
		</>
	)
}
