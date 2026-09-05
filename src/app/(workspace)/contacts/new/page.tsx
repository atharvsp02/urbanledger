import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ContactForm } from '@/app/(workspace)/contacts/contact-form'

export const metadata: Metadata = { title: 'New contact' }

export default function NewContactPage() {
	return (
		<>
			<PageHeader
				title="New contact"
				lead="Create a customer or vendor record. Portal access and a profile image can be added once the contact is saved."
				breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: 'New contact' }]}
			/>
			<ContactForm />
		</>
	)
}
