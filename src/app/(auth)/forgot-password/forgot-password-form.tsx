'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { forgotPasswordAction, type RecoveryState } from '@/app/(auth)/actions'
import { AuthField, AuthSubmit } from '@/app/(auth)/form-controls'

export function ForgotPasswordForm() {
	const [state, action, pending] = useActionState(forgotPasswordAction, null as RecoveryState)

	if (state?.ok) {
		return (
			<div className="space-y-5">
				<p role="status" className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">
					If the email belongs to an account, a recovery link is available in the captured local
					email inbox.
				</p>
				<Link
					className="font-semibold text-accent underline-offset-4 hover:underline"
					href="/login"
				>
					Return to sign in
				</Link>
			</div>
		)
	}

	return (
		<form action={action} className="space-y-5">
			<AuthField label="Email" name="email" type="email" autoComplete="email" required autoFocus />
			<AuthSubmit pending={pending}>{pending ? 'Requesting...' : 'Request reset link'}</AuthSubmit>
		</form>
	)
}
