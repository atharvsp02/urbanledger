'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
	disableIdentityAction,
	restoreIdentityAction,
	revokePortalAccessAction,
	revokeStaffGrantAction
} from '@/app/(workspace)/settings/actions'

export function IdentityControl({
	userId,
	displayName,
	isDisabled
}: {
	userId: string
	displayName: string
	isDisabled: boolean
}) {
	const [operationKey] = useState(() => crypto.randomUUID())

	if (isDisabled) {
		return (
			<ConfirmDialog
				triggerLabel="Restore"
				title={`Restore ${displayName}?`}
				description="The identity can sign in again with its existing grants."
				confirmLabel="Restore identity"
				successMessage="Restored."
				onConfirm={() => restoreIdentityAction(userId, operationKey)}
			/>
		)
	}

	return (
		<ConfirmDialog
			triggerLabel="Disable"
			title={`Disable ${displayName}?`}
			description="A disabled identity cannot sign in."
			consequence="The last active administrator cannot be disabled."
			confirmLabel="Disable identity"
			isDestructive
			successMessage="Disabled."
			onConfirm={() => disableIdentityAction(userId, operationKey)}
		/>
	)
}

export function GrantControl({
	grantId,
	displayName,
	role
}: {
	grantId: string
	displayName: string
	role: string
}) {
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<ConfirmDialog
			triggerLabel="Revoke grant"
			title={`Revoke the ${role} grant for ${displayName}?`}
			description="The user keeps their identity but loses this business role."
			consequence="The last active administrator grant cannot be revoked."
			confirmLabel="Revoke grant"
			isDestructive
			successMessage="Revoked."
			onConfirm={() => revokeStaffGrantAction(grantId, operationKey)}
		/>
	)
}

export function PortalAccessControl({
	portalAccessId,
	displayName
}: {
	portalAccessId: string
	displayName: string
}) {
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<ConfirmDialog
			triggerLabel="Revoke portal"
			title={`Revoke portal access for ${displayName}?`}
			description="The contact can no longer sign in to the portal."
			consequence="Historical documents and payments stay unchanged."
			confirmLabel="Revoke portal access"
			isDestructive
			successMessage="Revoked."
			onConfirm={() => revokePortalAccessAction(portalAccessId, operationKey)}
		/>
	)
}
