'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setAnalyticAccountArchivedAction } from '@/app/(workspace)/accounting/analytic-accounts/actions'

export function ArchiveControl({
	analyticAccountId,
	analyticAccountName,
	revision,
	isArchived
}: {
	analyticAccountId: string
	analyticAccountName: string
	revision: number
	isArchived: boolean
}) {
	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${analyticAccountName}?`}
				description="The analytic account becomes selectable again on new documents and budgets."
				confirmLabel="Restore analytic account"
				successMessage="Restored."
				onConfirm={() => setAnalyticAccountArchivedAction(analyticAccountId, revision, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${analyticAccountName}?`}
			description="Archiving hides the analytic account from new selections."
			consequence="Existing budgets and tagged journal items keep it and remain readable."
			confirmLabel="Archive analytic account"
			isDestructive
			successMessage="Archived."
			onConfirm={() => setAnalyticAccountArchivedAction(analyticAccountId, revision, true)}
		/>
	)
}
