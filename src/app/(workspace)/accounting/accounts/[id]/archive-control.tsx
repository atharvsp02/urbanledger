'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setLedgerAccountArchivedAction } from '@/app/(workspace)/accounting/accounts/actions'

export function ArchiveControl({
	accountId,
	accountName,
	revision,
	isArchived,
	isBlocked
}: {
	accountId: string
	accountName: string
	revision: number
	isArchived: boolean
	isBlocked: boolean
}) {
	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${accountName}?`}
				description="The account becomes selectable again on journals and postings."
				confirmLabel="Restore account"
				successMessage="Restored."
				onConfirm={() => setLedgerAccountArchivedAction(accountId, revision, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${accountName}?`}
			description="Archiving hides the account from new selections."
			consequence="Posted entries keep this account and remain readable. Archiving does not remove history."
			confirmLabel="Archive account"
			isDestructive
			isDisabled={isBlocked}
			successMessage="Archived."
			onConfirm={() => setLedgerAccountArchivedAction(accountId, revision, true)}
		/>
	)
}
