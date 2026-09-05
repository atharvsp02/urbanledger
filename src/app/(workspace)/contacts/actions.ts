'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import { contactInputSchema, type ContactKind } from '@/lib/masters/contact'
import { createContact, setContactArchived, updateContact } from '@/server/masters/contacts'
import { toActionResult } from '@/server/actions/result'

export type ContactActionState = ActionResult<{ id: string }> | null

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
