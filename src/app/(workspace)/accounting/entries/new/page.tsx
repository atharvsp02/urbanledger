import { randomUUID } from 'node:crypto'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { getJournalPostingOptions } from '@/server/accounting'
import { getActor } from '@/server/auth/actor'
import { JournalEntryForm } from '@/app/(workspace)/accounting/entries/journal-entry-form'

export default async function NewJournalEntryPage() {
	const actor = await getActor()
	const result = await getJournalPostingOptions(actor)

	return (
		<>
			<PageHeader
				title="New journal entry"
				lead="Post a balanced manual adjustment or an opening cash and capital entry."
				breadcrumbs={[{ label: 'Journal entries', href: '/accounting/entries' }, { label: 'New' }]}
			/>

			{result.ok ? (
				<JournalEntryForm
					options={result.data}
					defaultDate={new Date().toISOString().slice(0, 10)}
					operationKey={randomUUID()}
				/>
			) : result.error.code === 'FORBIDDEN' ? (
				<ForbiddenState description={result.error.message} />
			) : (
				<ErrorState description={result.error.message} />
			)}
		</>
	)
}
