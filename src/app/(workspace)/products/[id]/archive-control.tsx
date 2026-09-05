'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setProductArchivedAction } from '@/app/(workspace)/products/actions'

export function ArchiveControl({
	productId,
	productName,
	isArchived
}: {
	productId: string
	productName: string
	isArchived: boolean
}) {
	if (isArchived) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${productName}?`}
				description="The product becomes selectable again on new documents."
				confirmLabel="Restore product"
				successMessage="Restored."
				onConfirm={() => setProductArchivedAction(productId, false)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Archive"
			title={`Archive ${productName}?`}
			description="Archiving hides the product from new documents."
			consequence="Issued documents keep the price and description they were created with."
			confirmLabel="Archive product"
			isDestructive
			successMessage="Archived."
			onConfirm={() => setProductArchivedAction(productId, true)}
		/>
	)
}
