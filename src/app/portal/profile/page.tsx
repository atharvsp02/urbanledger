import type { Metadata } from 'next'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getContactImageForActor } from '@/server/masters/contact-images'
import { getPortalProfile } from '@/server/portal'
import { ContactImage } from '@/app/(workspace)/contacts/[id]/contact-image'
import { PortalProfileForm } from '@/app/portal/profile/profile-form'

export const metadata: Metadata = { title: 'My profile | UrbanLedger' }
export const dynamic = 'force-dynamic'

export default async function PortalProfilePage() {
	const actor = await getActor()
	const profile = await getPortalProfile(actor)

	if (!profile.ok) return <ErrorState description={profile.error.message} />

	const image = await getContactImageForActor(actor, profile.data.id)

	return (
		<>
			<PageHeader title="My profile" lead="Keep your contact details and profile photo current." />

			<div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
				<WorkSurface
					title="Profile photo"
					description="This photo is visible only to authorised users of this business."
				>
					<ContactImage
						contactId={profile.data.id}
						contactName={profile.data.name}
						imageUrl={image?.url ?? null}
						canEdit
					/>
				</WorkSurface>

				<WorkSurface title="Contact information">
					<PortalProfileForm profile={profile.data} />
				</WorkSurface>
			</div>
		</>
	)
}
