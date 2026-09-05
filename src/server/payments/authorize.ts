import 'server-only'
import type { Actor, Capability } from '@/lib/contracts/access'
import type { Prisma } from '@/generated/prisma/client'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { roleHasCapability } from '@/server/access/permissions'
import { ApplicationError } from '@/server/errors/application-error'

export async function requireCurrentPaymentActor(
	transaction: Prisma.TransactionClient,
	actor: Actor,
	capability: Capability
) {
	if (actor.role !== 'CONTACT') {
		return requireCurrentAccountingActor(transaction, actor, capability)
	}
	if (!roleHasCapability(actor.role, capability) || !actor.contactId) {
		throw new ApplicationError('FORBIDDEN', 'You do not have permission to perform this action.')
	}

	const access = await transaction.portalAccess.findFirst({
		where: {
			businessId: actor.businessId,
			contactId: actor.contactId,
			userId: actor.userId,
			status: 'ACTIVE',
			revokedAt: null,
			user: {
				providerUserId: actor.providerUserId,
				status: 'ACTIVE',
				disabledAt: null
			}
		},
		select: { business: { select: { accountingLockDate: true, timezone: true } } }
	})
	if (!access) {
		throw new ApplicationError('FORBIDDEN', 'Your portal access is no longer active.')
	}

	return access.business
}
