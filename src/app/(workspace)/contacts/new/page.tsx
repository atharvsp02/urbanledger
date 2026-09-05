import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ContactForm } from '@/app/(workspace)/contacts/contact-form'
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'

export const metadata: Metadata = { title: 'New contact' }

export default function NewContactPage() {
	return (
		<>
			<PageHeader
				title="New contact"
				lead="Create a customer or vendor record."
				breadcrumbs={[{ label: 'Contacts', href: '/contacts' }, { label: 'New contact' }]}
			/>
			<FixtureNotice>
				Contacts are held in temporary local data until the master-data service is connected.
				Records created here do not survive a server restart.
			</FixtureNotice>
			<ContactForm />
		</>
	)
}
