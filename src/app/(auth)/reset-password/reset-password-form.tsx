'use client'

import { useActionState } from 'react'
import { resetPasswordAction, type RecoveryState } from '@/app/(auth)/actions'
import { AuthField, AuthSubmit, FormMessage } from '@/app/(auth)/form-controls'

export function ResetPasswordForm() {
	const [state, action, pending] = useActionState(resetPasswordAction, null as RecoveryState)
	const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined

	return (
		<form action={action} className="space-y-5">
			<AuthField
				label="New password"
				name="password"
				type="password"
				autoComplete="new-password"
				minLength={9}
				required
				autoFocus
				error={fieldErrors?.password?.[0]}
			/>
			<AuthField
				label="Confirm new password"
				name="passwordConfirmation"
				type="password"
				autoComplete="new-password"
				minLength={9}
				required
				error={fieldErrors?.passwordConfirmation?.[0]}
			/>
			<FormMessage message={state && !state.ok ? state.error.message : undefined} />
			<AuthSubmit pending={pending}>{pending ? 'Updating...' : 'Update password'}</AuthSubmit>
		</form>
	)
}
