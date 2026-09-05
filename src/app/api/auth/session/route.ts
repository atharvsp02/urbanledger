import type { ActionResult } from '@/lib/contracts/errors'
import type { SessionActor } from '@/lib/contracts/access'
import { getActor } from '@/server/auth/actor'
import { ApplicationError } from '@/server/errors/application-error'

export async function GET() {
	try {
		const actor = await getActor()
		const result: ActionResult<SessionActor> = {
			ok: true,
			data: {
				userId: actor.userId,
				businessId: actor.businessId,
				role: actor.role,
				contactId: actor.contactId,
				displayName: actor.displayName,
				capabilities: actor.capabilities
			}
		}

		return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
	} catch (error) {
		const applicationError =
			error instanceof ApplicationError
				? error
				: new ApplicationError('INTERNAL_ERROR', 'The session could not be loaded.')
		const status =
			applicationError.code === 'UNAUTHENTICATED'
				? 401
				: applicationError.code === 'FORBIDDEN'
					? 403
					: applicationError.code === 'DATABASE_UNAVAILABLE' ||
						  applicationError.code === 'AUTH_UNAVAILABLE'
						? 503
						: 500
		const result: ActionResult<never> = { ok: false, error: applicationError.toActionError() }

		return Response.json(result, {
			status,
			headers: { 'Cache-Control': 'private, no-store' }
		})
	}
}
