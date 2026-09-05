import type { Capability, Role } from '@/lib/contracts/access'

const adminCapabilities = [
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
	'reports:read'
] as const satisfies readonly Capability[]

const accountantCapabilities = [
	'contacts:read',
	'contacts:create',
	'contacts:update',
	'contact-access:create',
	'masters:read',
	'masters:create',
	'transactions:read',
	'transactions:create',
	'transactions:post',
	'transactions:reverse',
	'payments:record',
	'reports:read'
] as const satisfies readonly Capability[]

const contactCapabilities = [
	'portal-documents:read',
	'portal-payments:create'
] as const satisfies readonly Capability[]

export const capabilitiesByRole = {
	ADMIN: adminCapabilities,
	ACCOUNTANT: accountantCapabilities,
	CONTACT: contactCapabilities
} as const satisfies Record<Role, readonly Capability[]>

export function roleHasCapability(role: Role, capability: Capability) {
	return (capabilitiesByRole[role] as readonly Capability[]).includes(capability)
}
