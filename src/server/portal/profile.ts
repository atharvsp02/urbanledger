import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	portalProfileInputSchema,
	type PortalProfile,
	type PortalProfileInput
} from '@/lib/contracts/portal-profile'
import { toActionResult } from '@/server/actions/result'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

function contactIdFor(actor: Actor) {
	if (actor.role !== 'CONTACT' || actor.contactId == null) {
		throw new ApplicationError('FORBIDDEN', 'This profile belongs to a portal Contact.')
	}

	return actor.contactId
}

export async function getPortalProfile(actor: Actor): Promise<ActionResult<PortalProfile>> {
	return toActionResult(async () => {
		const contactId = contactIdFor(actor)
		const contact = await getPrisma().contact.findFirst({
			where: { id: contactId, businessId: actor.businessId },
			select: {
				id: true,
				name: true,
				email: true,
				mobile: true,
				street: true,
				city: true,
				state: true,
				pincode: true,
				revision: true
			}
		})

		if (contact == null) {
			throw new ApplicationError('NOT_FOUND', 'Your linked Contact record does not exist.')
		}

		return contact
	})
}

export async function updatePortalProfile(
	actor: Actor,
	input: PortalProfileInput
): Promise<ActionResult<PortalProfile>> {
	return toActionResult(async () => {
		const contactId = contactIdFor(actor)
		const parsed = portalProfileInputSchema.parse(input)
		const { revision, ...details } = parsed

		return getPrisma().$transaction(async (transaction) => {
			const current = await transaction.contact.findFirst({
				where: { id: contactId, businessId: actor.businessId },
				select: { id: true, archivedAt: true, revision: true }
			})

			if (current == null) {
				throw new ApplicationError('NOT_FOUND', 'Your linked Contact record does not exist.')
			}
			if (current.archivedAt != null) {
				throw new ApplicationError(
					'INVALID_STATE',
					'An archived Contact profile cannot be changed.'
				)
			}
			if (current.revision !== revision) {
				throw new ApplicationError(
					'STALE_REVISION',
					'Your profile changed in another session. Reload and review the current values.'
				)
			}

			const contact = await transaction.contact.update({
				where: { id: contactId },
				data: { ...details, revision: { increment: 1 } },
				select: {
					id: true,
					name: true,
					email: true,
					mobile: true,
					street: true,
					city: true,
					state: true,
					pincode: true,
					revision: true
				}
			})

			await transaction.applicationUser.update({
				where: { id: actor.userId },
				data: { displayName: contact.name }
			})
			await transaction.auditEvent.create({
				data: {
					businessId: actor.businessId,
					actorUserId: actor.userId,
					action: 'portal.profile.updated',
					targetType: 'Contact',
					targetId: contactId,
					requestId: randomUUID()
				}
			})

			return contact
		})
	})
}
