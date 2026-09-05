import { AuthCard } from '@/app/(auth)/auth-card'
import { ResetPasswordForm } from '@/app/(auth)/reset-password/reset-password-form'

export default function ResetPasswordPage() {
	return (
		<AuthCard
			title="Choose a new password"
			description="Use the recovery link from the captured local inbox."
		>
			<ResetPasswordForm />
		</AuthCard>
	)
}
