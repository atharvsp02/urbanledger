'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { loginAction, type LoginState } from '@/app/(auth)/actions'
import { AuthField, AuthSubmit, FormMessage } from '@/app/(auth)/form-controls'

export function LoginForm({ returnTo }: { returnTo: string }) {
	const [state, action, pending] = useActionState(loginAction, null as LoginState)

	return (
		<form action={action} className="space-y-5">
			<input type="hidden" name="returnTo" value={returnTo} />
			<AuthField
				label="Login ID"
				name="loginId"
				autoComplete="username"
				required
				autoFocus
				error={state && !state.ok ? state.error.fieldErrors?.loginId?.[0] : undefined}
			/>
			<AuthField
				label="Password"
				name="password"
				type="password"
				autoComplete="current-password"
				required
				error={state && !state.ok ? state.error.fieldErrors?.password?.[0] : undefined}
			/>
			<FormMessage message={state && !state.ok ? state.error.message : undefined} />
			<AuthSubmit pending={pending}>{pending ? 'Signing in...' : 'Sign in'}</AuthSubmit>
			<div className="flex justify-between text-sm">
				<Link className="text-accent underline-offset-4 hover:underline" href="/forgot-password">
					Forgot password?
				</Link>
				<Link className="text-accent underline-offset-4 hover:underline" href="/signup">
					Sign up
				</Link>
			</div>
		</form>
	)
}
