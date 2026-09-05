import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { ApplicationError } from '@/server/errors/application-error'

type AccessTransaction = Prisma.TransactionClient

export async function assertAnotherPermanentAdmin(
	transaction: AccessTransaction,
	businessId: string,
	excludedUserId: string
) {
	await transaction.$queryRaw(
		Prisma.sql`SELECT id FROM app.businesses WHERE id = ${businessId}::uuid FOR UPDATE`
	)
	const count = await transaction.staffGrant.count({
		where: {
			businessId,
			role: 'ADMIN',
			userId: { not: excludedUserId },
			revokedAt: null,
			validFrom: { lte: new Date() },
			validUntil: null,
			user: { status: 'ACTIVE', disabledAt: null }
		}
	})
	if (count === 0) {
		throw new ApplicationError(
			'INVALID_STATE',
			'At least one active, non-expiring Administrator must remain.'
		)
	}
}
