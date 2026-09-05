import 'server-only'
import type { Actor, Capability, Role } from '@/lib/contracts/access'
import { capabilitiesByRole, roleHasCapability } from '@/server/access/permissions'
import { ApplicationError } from '@/server/errors/application-error'
import { getPrisma } from '@/server/db/prisma'
import { createServerSupabaseClient } from '@/server/auth/supabase'

function activeAt(
	grant: { validFrom: Date; validUntil: Date | null; revokedAt: Date | null },
	now: Date
) {
	return !grant.revokedAt && grant.validFrom <= now && (!grant.validUntil || grant.validUntil > now)
}

export async function getActor(): Promise<Actor> {
	const supabase = await createServerSupabaseClient()
	const { data, error } = await supabase.auth.getClaims()
	const providerUserId = data?.claims.sub

	if (error || typeof providerUserId !== 'string') {
		throw new ApplicationError('UNAUTHENTICATED', 'Sign in to continue.')
	}

	let user

	try {
		user = await getPrisma().applicationUser.findUnique({
			where: { providerUserId },
			include: { staffGrants: true, portalAccess: true }
		})
	} catch (cause) {
		throw new ApplicationError(
			'DATABASE_UNAVAILABLE',
			'Business access could not be checked. Try again when local services are available.',
			undefined,
			{ cause }
		)
	}

	if (!user || user.status !== 'ACTIVE' || user.disabledAt) {
		throw new ApplicationError('FORBIDDEN', 'This account does not have active UrbanLedger access.')
	}

	const now = new Date()
	const activeStaffGrants = user.staffGrants.filter((grant) => activeAt(grant, now))
	const portalAccess = user.portalAccess?.status === 'ACTIVE' ? user.portalAccess : null

	if (activeStaffGrants.length > 0 && portalAccess) {
		throw new ApplicationError('FORBIDDEN', 'Conflicting access requires administrator review.')
	}

	if (activeStaffGrants.length > 0) {
		const selectedGrant =
			activeStaffGrants.find((grant) => grant.role === 'ADMIN') ?? activeStaffGrants[0]
		const role = selectedGrant.role as Role

		return {
			userId: user.id,
			providerUserId: user.providerUserId,
			businessId: selectedGrant.businessId,
			role,
			contactId: null,
			displayName: user.displayName,
			capabilities: capabilitiesByRole[role]
		}
	}

	if (portalAccess) {
		return {
			userId: user.id,
			providerUserId: user.providerUserId,
			businessId: portalAccess.businessId,
			role: 'CONTACT',
			contactId: portalAccess.contactId,
			displayName: user.displayName,
			capabilities: capabilitiesByRole.CONTACT
		}
	}

	throw new ApplicationError('FORBIDDEN', 'This account does not have active UrbanLedger access.')
}

export async function requireActor(capability: Capability) {
	const actor = await getActor()

	if (!roleHasCapability(actor.role, capability)) {
		throw new ApplicationError('FORBIDDEN', 'You do not have permission to perform this action.')
	}

	return actor
}
