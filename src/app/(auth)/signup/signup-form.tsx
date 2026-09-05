'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signupAction, type SignupState } from '@/app/(auth)/actions'
import { AuthField, AuthSubmit, FormMessage } from '@/app/(auth)/form-controls'

export function SignupForm({ operationKey }: { operationKey: string }) {
	const [state, action, pending] = useActionState(signupAction, null as SignupState)

	if (state?.ok) {
		return (
			<div className="space-y-5">
				<p role="status" className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-800">
					Account created for {state.data.loginId}. Open the captured local email and confirm your
					address before signing in.
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

	const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined

	return (
		<form action={action} className="space-y-5">
			<input type="hidden" name="operationKey" value={operationKey} />
			<AuthField
				label="Name"
				name="displayName"
				autoComplete="name"
				required
				autoFocus
				error={fieldErrors?.displayName?.[0]}
			/>
			<AuthField
				label="Login ID"
				name="loginId"
				autoComplete="username"
				minLength={6}
				maxLength={12}
				required
				error={fieldErrors?.loginId?.[0]}
			/>
			<AuthField
				label="Email"
				name="email"
				type="email"
				autoComplete="email"
				required
				error={fieldErrors?.email?.[0]}
			/>
			<AuthField
				label="Password"
				name="password"
				type="password"
				autoComplete="new-password"
				minLength={9}
				required
				error={fieldErrors?.password?.[0]}
			/>
			<AuthField
				label="Confirm password"
				name="passwordConfirmation"
				type="password"
				autoComplete="new-password"
				minLength={9}
				required
				error={fieldErrors?.passwordConfirmation?.[0]}
			/>
			<FormMessage message={state && !state.ok ? state.error.message : undefined} />
			<AuthSubmit pending={pending}>{pending ? 'Creating account...' : 'Sign up'}</AuthSubmit>
			<p className="text-sm text-muted-foreground">
				Already have access?{' '}
				<Link className="text-accent underline-offset-4 hover:underline" href="/login">
					Sign in
				</Link>
			</p>
		</form>
	)
}
