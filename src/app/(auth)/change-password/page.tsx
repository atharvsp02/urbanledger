import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { AuthCard } from '@/app/(auth)/auth-card'
import { ResetPasswordForm } from '@/app/(auth)/reset-password/reset-password-form'
import { getActor } from '@/server/auth/actor'

export const metadata: Metadata = { title: 'Change password' }

export default async function ChangePasswordPage() {
	try {
		await getActor()
	} catch {
		redirect('/login?returnTo=/change-password')
	}

	return (
		<AuthCard
			title="Change your password"
			description="Choose a new password. You are signed out afterwards and sign in again with the new one."
		>
			<ResetPasswordForm />
		</AuthCard>
	)
}
