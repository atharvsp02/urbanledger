'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setContactArchivedAction } from '@/app/(workspace)/contacts/actions'

export function ArchiveControl({
	contactId,
	contactName,
	isArchived
}: {
	contactId: string
	contactName: string
	isArchived: boolean
}) {
	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${contactName}?`}
				description="The contact becomes selectable again on new orders."
				confirmLabel="Restore contact"
				successMessage="Restored."
				onConfirm={() => setContactArchivedAction(contactId, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${contactName}?`}
			description="Archiving hides the contact from new orders."
			consequence="Existing documents keep this contact and remain settleable. Archiving does not remove history."
			confirmLabel="Archive contact"
			isDestructive
			successMessage="Archived."
			onConfirm={() => setContactArchivedAction(contactId, true)}
		/>
	)
}
