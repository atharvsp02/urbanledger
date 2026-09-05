export const roles = ['ADMIN', 'ACCOUNTANT', 'CONTACT'] as const

export type Role = (typeof roles)[number]

export const capabilities = [
	'business:manage',
	'access:manage',
	'audit:read',
	'contacts:read',
	'contacts:create',
	'contacts:update',
	'contact-access:create',
	'masters:read',
	'masters:create',
	'masters:update',
	'masters:archive',
	'transactions:read',
	'transactions:create',
	'transactions:post',
	'transactions:reverse',
	'payments:record',
	'reports:read',
	'portal-documents:read',
	'portal-payments:create'
] as const

export type Capability = (typeof capabilities)[number]

export type Actor = {
	userId: string
	providerUserId: string
	businessId: string
	role: Role
	contactId: string | null
	displayName: string
	capabilities: readonly Capability[]
}

export type SessionActor = Pick<
	Actor,
	'userId' | 'businessId' | 'role' | 'contactId' | 'displayName' | 'capabilities'
>
