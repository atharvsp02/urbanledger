import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { listSelectableAccounts } from '@/server/masters/ledger-accounts'
import { JournalForm } from '@/app/(workspace)/accounting/journals/journal-form'

export const metadata: Metadata = { title: 'New journal' }

export default async function NewJournalPage() {
	const accounts = await listSelectableAccounts()

	return (
		<>
			<PageHeader
				title="New journal"
				lead="Choose the type first; its required default accounts follow."
				breadcrumbs={[
					{ label: 'Journals', href: '/accounting/journals' },
					{ label: 'New journal' }
				]}
			/>
			<JournalForm accounts={accounts} />
		</>
	)
}
