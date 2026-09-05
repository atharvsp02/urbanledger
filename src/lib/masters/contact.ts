import { z } from 'zod'

export const contactKinds = ['CUSTOMER', 'VENDOR', 'BOTH'] as const
export type ContactKind = (typeof contactKinds)[number]

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
	CUSTOMER: 'Customer',
	VENDOR: 'Vendor',
	BOTH: 'Both'
}

export const contactSortColumns = ['name', 'kind', 'city', 'createdAt'] as const
export type ContactSortColumn = (typeof contactSortColumns)[number]

export const CONTACT_SORT_LABELS: Record<ContactSortColumn, string> = {
	name: 'Name',
	kind: 'Type',
	city: 'City',
	createdAt: 'Created'
}

const optionalText = (max: number, message: string) =>
	z
		.string()
		.trim()
		.max(max, message)
		.transform((value) => (value.length === 0 ? null : value))
		.nullable()

// Mobile and pincode stay strings so leading zeros survive.
export const contactInputSchema = z.object({
	name: z.string().trim().min(1, 'Enter a contact name.').max(160, 'Use 160 characters or fewer.'),
	kind: z.enum(contactKinds, { message: 'Choose a contact type.' }),
	email: z
		.string()
		.trim()
		.toLowerCase()
		.transform((value) => (value.length === 0 ? null : value))
		.nullable()
		.refine((value) => value === null || z.email().safeParse(value).success, {
			message: 'Enter a valid email address.'
		}),
	mobile: optionalText(32, 'Use 32 characters or fewer.').refine(
		(value) => value === null || /^[0-9+][0-9 -]{5,31}$/.test(value),
		{ message: 'Enter a valid mobile number.' }
	),
	street: optionalText(240, 'Use 240 characters or fewer.'),
	city: optionalText(100, 'Use 100 characters or fewer.'),
	state: optionalText(100, 'Use 100 characters or fewer.'),
	pincode: optionalText(16, 'Use 16 characters or fewer.').refine(
		(value) => value === null || /^[0-9]{4,16}$/.test(value),
		{ message: 'Enter digits only.' }
	)
})

export type ContactInput = z.output<typeof contactInputSchema>

export const contactListQuerySchema = z.object({
	search: z.string().trim().max(160).default(''),
	kind: z.enum([...contactKinds, 'ALL']).default('ALL'),
	includeArchived: z.boolean().default(false),
	sort: z.enum(contactSortColumns).default('name'),
	direction: z.enum(['asc', 'desc']).default('asc'),
	page: z.coerce.number().int().min(1).catch(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export type ContactListQuery = z.input<typeof contactListQuerySchema>

export type ContactPortalState = 'none' | 'pending' | 'active' | 'failed' | 'revoked'

export type ContactSummary = {
	id: string
	name: string
	kind: ContactKind
	email: string | null
	mobile: string | null
	city: string | null
	state: string | null
	archivedAt: string | null
	revision: number
	portalState: ContactPortalState
}

export type ContactDetail = ContactSummary & {
	street: string | null
	pincode: string | null
	imageAssetId: string | null
	portalLoginId: string | null
	portalFailureCode: string | null
}
