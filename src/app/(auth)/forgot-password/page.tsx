import { AuthCard } from '@/app/(auth)/auth-card'
import { ForgotPasswordForm } from '@/app/(auth)/forgot-password/forgot-password-form'

export default function ForgotPasswordPage() {
	return (
		<AuthCard
			title="Reset your password"
			description="Recovery email stays inside the local captured inbox."
		>
			<ForgotPasswordForm />
		</AuthCard>
	)
}
