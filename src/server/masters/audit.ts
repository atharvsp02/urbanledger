import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import { getPrisma } from '@/server/db/prisma'

export async function recordMasterAudit(
	actor: Actor,
	action: string,
	targetType: string,
	targetId: string,
	details?: Prisma.InputJsonValue
) {
	await getPrisma().auditEvent.create({
		data: {
			businessId: actor.businessId,
			actorUserId: actor.userId,
			action,
			targetType,
			targetId,
			requestId: randomUUID(),
			details
		}
	})
}
