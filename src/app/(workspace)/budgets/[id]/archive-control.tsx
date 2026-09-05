'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setBudgetArchivedAction } from '@/app/(workspace)/budgets/actions'

export function ArchiveControl({
	budgetId,
	budgetName,
	revision,
	isArchived
}: {
	budgetId: string
	budgetName: string
	revision: number
	isArchived: boolean
}) {
	const [operationKey] = useState(() => crypto.randomUUID())

	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${budgetName}?`}
				description="The budget appears again in the active list and report selector."
				confirmLabel="Restore budget"
				successMessage="Restored."
				onConfirm={() => setBudgetArchivedAction(budgetId, revision, operationKey, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${budgetName}?`}
			description="Archiving hides the budget from the active list."
			consequence="Planned amounts and past reports stay readable."
			confirmLabel="Archive budget"
			isDestructive
			successMessage="Archived."
			onConfirm={() => setBudgetArchivedAction(budgetId, revision, operationKey, true)}
		/>
	)
}
