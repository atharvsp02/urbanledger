import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getAccessCreationOptions } from '@/server/access'
import { AccessForm } from '@/app/(workspace)/settings/access/new/access-form'

export const metadata: Metadata = { title: 'New user' }

export default async function NewAccessUserPage() {
	const actor = await getActor()
	const options = await getAccessCreationOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

	return (
		<>
			<PageHeader
				title="New user"
				lead="Create an administrator or a portal user linked to one contact."
				breadcrumbs={[
					{ label: 'Settings' },
					{ label: 'Access', href: '/settings/access' },
					{ label: 'New user' }
				]}
			/>
			<AccessForm options={options.data} />
		</>
	)
}
