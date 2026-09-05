import { redirect } from 'next/navigation'
import { logoutAction } from '@/app/(auth)/actions'
import { getActor } from '@/server/auth/actor'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
	const actor = await getActor()

	if (actor.role === 'CONTACT') {
		redirect('/portal')
	}

	return (
		<main id="main-content" className="mx-auto min-h-dvh w-full max-w-4xl px-6 py-16">
			<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
				{actor.role === 'ADMIN' ? 'Admin' : 'Accountant'} workspace
			</p>
			<h1 className="mt-4 text-4xl font-semibold">Welcome, {actor.displayName}</h1>
			<p className="mt-3 text-muted-foreground">
				Your authenticated backend session and database access are active.
			</p>
			<form action={logoutAction} className="mt-8">
				<button className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-foreground">
					Sign out
				</button>
			</form>
		</main>
	)
}
