import { AuthCard } from '@/app/(auth)/auth-card'
import { logoutAction } from '@/app/(auth)/actions'

export default function AccessDeniedPage() {
	return (
		<AuthCard
			title="Access unavailable"
			description="Your identity is valid, but no active UrbanLedger access is assigned."
		>
			<form action={logoutAction}>
				<button className="min-h-11 w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground">
					Sign out
				</button>
			</form>
		</AuthCard>
	)
}
