'use server'

import { redirect } from 'next/navigation'
import type { LoginResult, SignupResult } from '@/lib/contracts/auth'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	loginWithPassword,
	logout,
	requestPasswordReset,
	signupAccountant,
	updateRecoveredPassword
} from '@/server/auth/commands'

export type LoginState = ActionResult<LoginResult> | null
export type SignupState = ActionResult<SignupResult> | null
export type RecoveryState = ActionResult<null> | null

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
	const result = await loginWithPassword({
		loginId: String(formData.get('loginId') ?? ''),
		password: String(formData.get('password') ?? ''),
		returnTo: String(formData.get('returnTo') ?? '')
	})

	if (result.ok) {
		redirect(result.data.redirectTo)
	}

	return result
}

export async function signupAction(_state: SignupState, formData: FormData): Promise<SignupState> {
	return signupAccountant({
		operationKey: String(formData.get('operationKey') ?? ''),
		displayName: String(formData.get('displayName') ?? ''),
		loginId: String(formData.get('loginId') ?? ''),
		email: String(formData.get('email') ?? ''),
		password: String(formData.get('password') ?? ''),
		passwordConfirmation: String(formData.get('passwordConfirmation') ?? '')
	})
}

export async function forgotPasswordAction(
	_state: RecoveryState,
	formData: FormData
): Promise<RecoveryState> {
	return requestPasswordReset(String(formData.get('email') ?? ''))
}

export async function resetPasswordAction(
	_state: RecoveryState,
	formData: FormData
): Promise<RecoveryState> {
	const result = await updateRecoveredPassword({
		password: String(formData.get('password') ?? ''),
		passwordConfirmation: String(formData.get('passwordConfirmation') ?? '')
	})

	if (result.ok) {
		await logout()
		redirect('/login?password=updated')
	}

	return result
}

export async function logoutAction() {
	await logout()
	redirect('/login')
}
