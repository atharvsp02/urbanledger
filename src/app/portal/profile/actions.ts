'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/contracts/errors'
import type { PortalProfile } from '@/lib/contracts/portal-profile'
import { getActor } from '@/server/auth/actor'
import { updatePortalProfile } from '@/server/portal'

export type PortalProfileActionState = ActionResult<PortalProfile> | null

export async function savePortalProfileAction(
	_state: PortalProfileActionState,
	formData: FormData
): Promise<PortalProfileActionState> {
	const actor = await getActor()
	const result = await updatePortalProfile(actor, {
		revision: Number(formData.get('revision') ?? '0'),
		name: String(formData.get('name') ?? ''),
		email: String(formData.get('email') ?? ''),
		mobile: String(formData.get('mobile') ?? ''),
		street: String(formData.get('street') ?? ''),
		city: String(formData.get('city') ?? ''),
		state: String(formData.get('state') ?? ''),
		pincode: String(formData.get('pincode') ?? '')
	})

	if (result.ok) {
		revalidatePath('/portal')
		revalidatePath('/portal/profile')
	}

	return result
}
