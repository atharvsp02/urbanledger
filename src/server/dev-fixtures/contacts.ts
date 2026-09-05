import type { Contact, ContactInput, ContactType } from '@/lib/masters/contact'
import { nextId, paginate, type ListQuery, type ListResult } from '@/server/dev-fixtures/store'

const contacts: Contact[] = [
	{
		id: 'contact-001',
		name: 'Meera Interiors',
		type: 'customer',
		email: 'accounts@meerainteriors.example',
		mobile: '+91 98200 41120',
		addressLine: '14 Kalbadevi Road',
		city: 'Mumbai',
		state: 'Maharashtra',
		pincode: '400002',
		archivedAt: null
	},
	{
		id: 'contact-002',
		name: 'Kamat Residency',
		type: 'customer',
		email: 'purchase@kamatresidency.example',
		mobile: '+91 98450 77210',
		addressLine: '2nd Cross, Indiranagar',
		city: 'Bengaluru',
		state: 'Karnataka',
		pincode: '560038',
		archivedAt: null
	},
	{
		id: 'contact-003',
		name: 'Sundar Timber Works',
		type: 'vendor',
		email: 'sales@sundartimber.example',
		mobile: '+91 94440 20185',
		addressLine: '5 Anna Salai',
		city: 'Chennai',
		state: 'Tamil Nadu',
		pincode: '600002',
		archivedAt: null
	},
	{
		id: 'contact-004',
		name: 'Rehan Furniture Works',
		type: 'both',
		email: 'office@rehanfurniture.example',
		mobile: '+91 97110 63340',
		addressLine: 'Plot 22, Okhla Phase II',
		city: 'New Delhi',
		state: 'Delhi',
		pincode: '110020',
		archivedAt: null
	},
	{
		id: 'contact-005',
		name: 'Anjali Sharma',
		type: 'customer',
		email: 'anjali.sharma@example.com',
		mobile: '+91 90040 11298',
		addressLine: '31 Civil Lines',
		city: 'Jaipur',
		state: 'Rajasthan',
		pincode: '302006',
		archivedAt: '2026-07-30'
	}
]

export function listContacts(
	query: ListQuery & { type: ContactType | 'all' }
): ListResult<Contact> {
	const search = query.search.trim().toLowerCase()
	const matched = contacts
		.filter((contact) => query.includeArchived || contact.archivedAt == null)
		.filter((contact) => query.type === 'all' || contact.type === query.type)
		.filter(
			(contact) =>
				search === '' ||
				contact.name.toLowerCase().includes(search) ||
				contact.email.toLowerCase().includes(search) ||
				contact.city.toLowerCase().includes(search)
		)
		.sort((left, right) => left.name.localeCompare(right.name))

	return paginate(matched, query.page, query.pageSize)
}

export function getContact(id: string): Contact | undefined {
	return contacts.find((contact) => contact.id === id)
}

export function createContact(input: ContactInput): Contact {
	const contact: Contact = { id: nextId('contact', contacts), ...input, archivedAt: null }
	contacts.push(contact)
	return contact
}

export function updateContact(id: string, input: ContactInput): Contact | undefined {
	const index = contacts.findIndex((contact) => contact.id === id)
	const existing = contacts[index]
	if (existing == null) return undefined

	const updated: Contact = { ...existing, ...input }
	contacts[index] = updated
	return updated
}

export function setContactArchived(id: string, isArchived: boolean): Contact | undefined {
	const contact = getContact(id)
	if (contact == null) return undefined

	contact.archivedAt = isArchived ? new Date().toISOString().slice(0, 10) : null
	return contact
}

export function isEmailTaken(email: string, exceptId?: string): boolean {
	const normalised = email.trim().toLowerCase()
	return contacts.some((contact) => contact.email === normalised && contact.id !== exceptId)
}
