'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setJournalArchivedAction } from '@/app/(workspace)/accounting/journals/actions'

export function ArchiveControl({
	journalId,
	journalName,
	revision,
	isArchived
}: {
	journalId: string
	journalName: string
	revision: number
	isArchived: boolean
}) {
	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${journalName}?`}
				description="The journal becomes selectable again on new documents."
				confirmLabel="Restore journal"
				successMessage="Restored."
				onConfirm={() => setJournalArchivedAction(journalId, revision, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${journalName}?`}
			description="Archiving hides the journal from new documents."
			consequence="Posted entries keep this journal and remain part of the ledger."
			confirmLabel="Archive journal"
			isDestructive
			successMessage="Archived."
			onConfirm={() => setJournalArchivedAction(journalId, revision, true)}
		/>
	)
}
