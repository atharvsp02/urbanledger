import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import type { AccessUser } from '@/lib/contracts/access-administration'
import { ApplicationError } from '@/server/errors/application-error'

export async function loadAccessUser(
	transaction: Prisma.TransactionClient,
	businessId: string,
	userId: string
): Promise<AccessUser> {
	const user = await transaction.applicationUser.findFirst({
		where: {
			id: userId,
			OR: [{ staffGrants: { some: { businessId } } }, { portalAccess: { businessId } }]
		},
		include: {
			staffGrants: {
				where: { businessId },
				orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
			},
			portalAccess: {
				include: { contact: { select: { id: true, name: true } } }
			}
		}
	})
	if (!user || (user.portalAccess && user.portalAccess.businessId !== businessId)) {
		throw new ApplicationError('NOT_FOUND', 'This access user does not exist.')
	}

	return {
		id: user.id,
		loginId: user.loginId,
		identityEmail: user.normalizedEmail,
		displayName: user.displayName,
		status: user.status,
		mustChangePassword: user.mustChangePassword,
		disabledAt: user.disabledAt?.toISOString() ?? null,
		staffGrants: user.staffGrants.map((grant) => ({
			id: grant.id,
			role: grant.role as 'ADMIN' | 'ACCOUNTANT',
			validFrom: grant.validFrom.toISOString(),
			validUntil: grant.validUntil?.toISOString() ?? null,
			revokedAt: grant.revokedAt?.toISOString() ?? null
		})),
		portalAccess: user.portalAccess
			? {
					id: user.portalAccess.id,
					status: user.portalAccess.status,
					contact: user.portalAccess.contact,
					revokedAt: user.portalAccess.revokedAt?.toISOString() ?? null
				}
			: null,
		createdAt: user.createdAt.toISOString()
	}
}
