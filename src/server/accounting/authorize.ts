import 'server-only'
import type { Actor, Capability } from '@/lib/contracts/access'
import type { Prisma } from '@/generated/prisma/client'
import { roleHasCapability } from '@/server/access/permissions'
import { ApplicationError } from '@/server/errors/application-error'

export async function requireCurrentAccountingActor(
	transaction: Prisma.TransactionClient,
	actor: Actor,
	capability: Capability
) {
	if (!roleHasCapability(actor.role, capability) || actor.role === 'CONTACT') {
		throw new ApplicationError('FORBIDDEN', 'You do not have permission to perform this action.')
	}

	const now = new Date()
	const grant = await transaction.staffGrant.findFirst({
		where: {
			userId: actor.userId,
			businessId: actor.businessId,
			role: actor.role,
			revokedAt: null,
			validFrom: { lte: now },
			OR: [{ validUntil: null }, { validUntil: { gt: now } }],
			user: {
				providerUserId: actor.providerUserId,
				status: 'ACTIVE',
				disabledAt: null
			}
		},
		select: { business: { select: { accountingLockDate: true, timezone: true } } }
	})

	if (!grant) {
		throw new ApplicationError('FORBIDDEN', 'Your current business access is no longer active.')
	}

	return grant.business
}
