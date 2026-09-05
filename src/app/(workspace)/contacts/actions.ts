'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import { contactInputSchema, type ContactKind } from '@/lib/masters/contact'
import { contactAccessInputSchema } from '@/lib/masters/contact-access'
import { enableContactPortalAccess } from '@/server/masters/contact-access'
import { removeContactImage, replaceContactImage } from '@/server/masters/contact-images'
import { createContact, setContactArchived, updateContact } from '@/server/masters/contacts'
import { toActionResult } from '@/server/actions/result'

export type ContactActionState = ActionResult<{ id: string }> | null
export type ContactImageState = ActionResult<{ id: string }> | null
export type ContactAccessState = ActionResult<{ contactId: string; loginId: string }> | null

function readContactInput(formData: FormData) {
	const read = (key: string) => String(formData.get(key) ?? '')

	return {
		name: read('name'),
		kind: read('kind') as ContactKind,
		email: read('email'),
		mobile: read('mobile'),
		street: read('street'),
		city: read('city'),
		state: read('state'),
		pincode: read('pincode')
	}
}

export async function saveContactAction(
	_state: ContactActionState,
	formData: FormData
): Promise<ContactActionState> {
	const contactId = String(formData.get('contactId') ?? '')
	const revision = Number(formData.get('revision') ?? '0')

	const result = await toActionResult(async () => {
		const input = contactInputSchema.parse(readContactInput(formData))

		return contactId === '' ? createContact(input) : updateContact(contactId, revision, input)
	})

	if (result.ok) {
		revalidatePath('/contacts')
		redirect(`/contacts/${result.data.id}`)
	}

	return result
}

export async function setContactArchivedAction(
	contactId: string,
	revision: number,
	isArchived: boolean
) {
	const result = await toActionResult(() => setContactArchived(contactId, revision, isArchived))

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/contacts')
	revalidatePath(`/contacts/${contactId}`)
}

export async function saveContactImageAction(
	_state: ContactImageState,
	formData: FormData
): Promise<ContactImageState> {
	const contactId = String(formData.get('contactId') ?? '')
	const intent = String(formData.get('intent') ?? 'replace')
	const file = formData.get('image')

	const result = await toActionResult(async () => {
		if (intent === 'remove') {
			return removeContactImage(contactId)
		}

		if (!(file instanceof File)) {
			return { id: contactId }
		}

		await replaceContactImage(contactId, file)
		return { id: contactId }
	})

	if (result.ok) {
		revalidatePath(`/contacts/${contactId}`)
	}

	return result
}

export async function enableContactAccessAction(
	_state: ContactAccessState,
	formData: FormData
): Promise<ContactAccessState> {
	const contactId = String(formData.get('contactId') ?? '')
	const result = await toActionResult(() =>
		enableContactPortalAccess(
			contactAccessInputSchema.parse({
				contactId,
				loginId: String(formData.get('loginId') ?? ''),
				email: String(formData.get('email') ?? ''),
				password: String(formData.get('password') ?? ''),
				passwordConfirmation: String(formData.get('passwordConfirmation') ?? '')
			})
		)
	)

	if (result.ok) {
		revalidatePath(`/contacts/${contactId}`)
	}

	return result
}
