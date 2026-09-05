import type { FieldErrors } from '@/lib/masters/form-state'

export const CONTACT_TYPES = ['customer', 'vendor', 'both'] as const
export type ContactType = (typeof CONTACT_TYPES)[number]

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
	customer: 'Customer',
	vendor: 'Vendor',
	both: 'Both'
}

export type Contact = {
	id: string
	name: string
	type: ContactType
	email: string
	mobile: string
	addressLine: string
	city: string
	state: string
	pincode: string
	archivedAt: string | null
}

export type ContactInput = Omit<Contact, 'id' | 'archivedAt'>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Mobile and pincode stay strings so leading zeros survive.
const MOBILE_PATTERN = /^[0-9+][0-9 -]{5,19}$/
const PINCODE_PATTERN = /^[0-9]{4,10}$/

export function parseContactInput(form: {
	name: string
	type: string
	email: string
	mobile: string
	addressLine: string
	city: string
	state: string
	pincode: string
}): { input: ContactInput; errors: FieldErrors } {
	const errors: FieldErrors = {}
	const name = form.name.trim()
	const email = form.email.trim().toLowerCase()
	const mobile = form.mobile.trim()
	const addressLine = form.addressLine.trim()
	const city = form.city.trim()
	const state = form.state.trim()
	const pincode = form.pincode.trim()
	const type = CONTACT_TYPES.includes(form.type as ContactType)
		? (form.type as ContactType)
		: 'customer'

	if (name.length === 0) errors.name = 'Enter a contact name'
	else if (name.length > 120) errors.name = 'Use 120 characters or fewer'

	if (!CONTACT_TYPES.includes(form.type as ContactType)) errors.type = 'Choose a contact type'

	if (email.length === 0) errors.email = 'Enter an email address'
	else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address'

	if (mobile.length === 0) errors.mobile = 'Enter a mobile number'
	else if (!MOBILE_PATTERN.test(mobile)) errors.mobile = 'Enter a valid mobile number'

	if (addressLine.length === 0) errors.addressLine = 'Enter an address'
	if (city.length === 0) errors.city = 'Enter a city'
	if (state.length === 0) errors.state = 'Enter a state'

	if (pincode.length === 0) errors.pincode = 'Enter a pincode'
	else if (!PINCODE_PATTERN.test(pincode)) errors.pincode = 'Enter digits only'

	return {
		input: { name, type, email, mobile, addressLine, city, state, pincode },
		errors
	}
}
