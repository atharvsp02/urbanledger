import { redirect } from 'next/navigation'
import { logoutAction } from '@/app/(auth)/actions'
import { AppShell } from '@/components/app-shell/app-shell'
import { AccountBlock } from '@/components/app-shell/account-block'
import { getActor } from '@/server/auth/actor'
import { ApplicationError } from '@/server/errors/application-error'
import { workspaceNavGroups } from '@/app/(workspace)/workspace-nav'

export const dynamic = 'force-dynamic'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
	let actor

	try {
		actor = await getActor()
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'UNAUTHENTICATED') {
			redirect('/login')
		}

		if (error instanceof ApplicationError && error.code === 'FORBIDDEN') {
			redirect('/access-denied')
		}

		throw error
	}

	if (actor.role === 'CONTACT') {
		redirect('/portal')
	}

	return (
		<AppShell
			productLabel="Accounting"
			homeHref="/dashboard"
			groups={workspaceNavGroups(actor)}
			account={
				<AccountBlock
					displayName={actor.displayName}
					role={actor.role}
					signOutAction={logoutAction}
				/>
			}
		>
			{children}
		</AppShell>
	)
}
