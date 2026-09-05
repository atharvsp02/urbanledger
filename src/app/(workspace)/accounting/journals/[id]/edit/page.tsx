import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { getJournalDetail } from '@/server/masters/journals'
import { listSelectableAccounts } from '@/server/masters/ledger-accounts'
import { ApplicationError } from '@/server/errors/application-error'
import { JournalForm } from '@/app/(workspace)/accounting/journals/journal-form'

export const metadata: Metadata = { title: 'Edit journal' }

export default async function EditJournalPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	let journal

	try {
		journal = await getJournalDetail(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const accounts = await listSelectableAccounts()

	return (
		<>
			<PageHeader
				title={`Edit ${journal.code}`}
				lead="Posted entries keep the journal they were recorded under."
				breadcrumbs={[
					{ label: 'Journals', href: '/accounting/journals' },
					{ label: journal.code, href: `/accounting/journals/${journal.id}` },
					{ label: 'Edit' }
				]}
			/>
			<JournalForm journal={journal} accounts={accounts} isTypeLocked={journal.entryCount > 0} />
		</>
	)
}
