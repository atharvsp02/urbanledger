'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
	cancelSalesOrderAction,
	confirmSalesOrderAction
} from '@/app/(workspace)/sales/orders/actions'

export function TransitionControls({
	salesOrderId,
	orderNumber,
	revision
}: {
	salesOrderId: string
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
				consequence="Products, quantities, prices, tax and analytic choices can no longer be edited. Delivery and invoicing work from the confirmed order."
				confirmLabel="Confirm order"
				successMessage="Confirmed."
				onConfirm={() => confirmSalesOrderAction(salesOrderId, revision, confirmKey)}
			/>
			<ConfirmDialog
				triggerLabel="Cancel order"
				title={`Cancel ${orderNumber}?`}
				description="Cancelling closes this order without any financial effect."
				consequence="An order with delivery or invoice history cannot be cancelled."
				confirmLabel="Cancel order"
				isDestructive
				successMessage="Cancelled."
				onConfirm={() => cancelSalesOrderAction(salesOrderId, revision, cancelKey)}
			/>
		</>
	)
}
