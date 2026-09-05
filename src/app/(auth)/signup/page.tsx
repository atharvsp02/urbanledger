import { randomUUID } from 'node:crypto'
import { AuthCard } from '@/app/(auth)/auth-card'
import { SignupForm } from '@/app/(auth)/signup/signup-form'

export default function SignupPage() {
	return (
		<AuthCard
			title="Create accountant access"
			description="Public signup creates an Accountant account only."
		>
			<SignupForm operationKey={randomUUID()} />
		</AuthCard>
	)
}
