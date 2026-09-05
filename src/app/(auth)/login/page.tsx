import { AuthCard } from '@/app/(auth)/auth-card'
import { LoginForm } from '@/app/(auth)/login/login-form'

export default async function LoginPage({
	searchParams
}: {
	searchParams: Promise<{ next?: string; password?: string }>
}) {
	const parameters = await searchParams

	return (
		<AuthCard title="Sign in" description="Use your UrbanLedger Login ID and password.">
			{parameters.password === 'updated' ? (
				<p role="status" className="mb-5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
					Password updated. Sign in with your new password.
				</p>
			) : null}
			<LoginForm returnTo={parameters.next ?? ''} />
		</AuthCard>
	)
}
