'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseContactInput } from '@/lib/masters/contact'
import type { MasterFormState } from '@/lib/masters/form-state'
import {
	createContact,
	getContact,
	isEmailTaken,
	setContactArchived,
	updateContact
} from '@/server/dev-fixtures/contacts'

function readContactForm(formData: FormData) {
	const read = (key: string) => String(formData.get(key) ?? '')
	return {
		name: read('name'),
		type: read('type'),
		email: read('email'),
		mobile: read('mobile'),
		addressLine: read('addressLine'),
		city: read('city'),
		state: read('state'),
		pincode: read('pincode')
	}
}

export async function saveContactAction(
	previousState: MasterFormState,
	formData: FormData
): Promise<MasterFormState> {
	const contactId = String(formData.get('contactId') ?? '')
	const { input, errors } = parseContactInput(readContactForm(formData))

	if (errors.email == null && isEmailTaken(input.email, contactId === '' ? undefined : contactId)) {
		errors.email = 'Another contact already uses this email address'
	}

	if (Object.keys(errors).length > 0) {
		return { status: 'invalid', errors, message: 'Nothing was saved.' }
	}

	const saved = contactId === '' ? createContact(input) : updateContact(contactId, input)
	if (saved == null) {
		return { status: 'failed', errors: {}, message: 'This contact no longer exists.' }
	}

	revalidatePath('/contacts')
	redirect(`/contacts/${saved.id}`)
}

export async function setContactArchivedAction(contactId: string, isArchived: boolean) {
	if (getContact(contactId) == null) throw new Error('This contact no longer exists.')

	setContactArchived(contactId, isArchived)
	revalidatePath('/contacts')
	revalidatePath(`/contacts/${contactId}`)
}
