'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setTaxArchivedAction } from '@/app/(workspace)/accounting/taxes/actions'

export function ArchiveControl({
	taxId,
	taxName,
	revision,
	isArchived
}: {
	taxId: string
	taxName: string
	revision: number
	isArchived: boolean
}) {
	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${taxName}?`}
				description="The tax becomes selectable again on new documents."
				confirmLabel="Restore tax"
				successMessage="Restored."
				onConfirm={() => setTaxArchivedAction(taxId, revision, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${taxName}?`}
			description="Archiving hides the tax from new documents."
			consequence="Issued documents keep the rate and amounts they were calculated with."
			confirmLabel="Archive tax"
			isDestructive
			successMessage="Archived."
			onConfirm={() => setTaxArchivedAction(taxId, revision, true)}
		/>
	)
}
