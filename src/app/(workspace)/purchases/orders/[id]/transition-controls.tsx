'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
	cancelPurchaseOrderAction,
	confirmPurchaseOrderAction
} from '@/app/(workspace)/purchases/orders/actions'

export function TransitionControls({
	purchaseOrderId,
	orderNumber,
	revision
}: {
	purchaseOrderId: string
	orderNumber: string
	revision: number
}) {
	const [confirmKey] = useState(() => crypto.randomUUID())
	const [cancelKey] = useState(() => crypto.randomUUID())

	return (
		<>
			<ConfirmDialog
				triggerLabel="Confirm"
				triggerVariant="primary"
				title={`Confirm ${orderNumber}?`}
				description="Confirming freezes the commercial lines of this order."
				consequence="Quantities, prices and the vendor can no longer be edited. Receipts and vendor bills are recorded against the confirmed order."
				confirmLabel="Confirm order"
				successMessage="Confirmed."
				onConfirm={() => confirmPurchaseOrderAction(purchaseOrderId, revision, confirmKey)}
			/>
			<ConfirmDialog
				triggerLabel="Cancel order"
				title={`Cancel ${orderNumber}?`}
				description="Cancelling closes this draft without any financial effect."
				consequence="The order stays readable but cannot be edited or confirmed afterwards."
				confirmLabel="Cancel order"
				isDestructive
				successMessage="Cancelled."
				onConfirm={() => cancelPurchaseOrderAction(purchaseOrderId, revision, cancelKey)}
			/>
		</>
	)
}
