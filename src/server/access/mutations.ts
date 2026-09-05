import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	accessMutationResultSchema,
	identityMutationInputSchema,
	portalAccessMutationInputSchema,
	staffGrantMutationInputSchema,
	type AccessMutationResult,
	type IdentityMutationInput,
	type PortalAccessMutationInput,
	type StaffGrantMutationInput
} from '@/lib/contracts/access-administration'
import { assertAnotherPermanentAdmin } from '@/server/access/last-admin'
import { createAdminSupabaseClient } from '@/server/auth/supabase'
import { ApplicationError } from '@/server/errors/application-error'
import {
	canonicalRequestHash,
	executeIdempotentOperation
} from '@/server/operations/command-operation'

type AccessTransaction = Prisma.TransactionClient

function actionFailure(error: unknown, requestId: string): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError(requestId) }
	}
	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'The access change could not be completed.',
			requestId
		}
	}
}

async function executeAccessMutation(input: {
	actor: Actor
	operationKey: string
	operation: string
	payload: object
	command: (transaction: AccessTransaction) => Promise<AccessMutationResult>
}) {
	return executeIdempotentOperation({
		actor: input.actor,
		capability: 'access:manage',
		operationKey: input.operationKey,
		operation: input.operation,
		requestHash: canonicalRequestHash({
			operation: input.operation,
			actorUserId: input.actor.userId,
			...input.payload
		}),
		parseStoredResult: (value) => {
			const stored = accessMutationResultSchema.safeParse(value)
			return stored.success ? stored.data : null
		},
		resourceId: (result) => result.targetId,
		command: input.command
	})
}

export async function disableIdentity(
	actor: Actor,
	input: IdentityMutationInput
): Promise<ActionResult<AccessMutationResult>> {
	const parsed = identityMutationInputSchema.safeParse(input)
	if (!parsed.success) {
		return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Check the identity.' } }
	}
	try {
		const result = await executeAccessMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: 'access.identity.disable',
			payload: { userId: parsed.data.userId },
			command: async (transaction) => {
				const user = await transaction.applicationUser.findFirst({
					where: {
						id: parsed.data.userId,
						OR: [
							{ staffGrants: { some: { businessId: actor.businessId } } },
							{ portalAccess: { businessId: actor.businessId } }
						]
					},
					include: { staffGrants: { where: { businessId: actor.businessId } } }
				})
				if (!user) throw new ApplicationError('NOT_FOUND', 'This identity does not exist.')
				const now = new Date()
				if (
					user.status === 'ACTIVE' &&
					user.disabledAt === null &&
					user.staffGrants.some(
						(grant) =>
							grant.role === 'ADMIN' &&
							!grant.revokedAt &&
							grant.validFrom <= now &&
							grant.validUntil === null
					)
				) {
					await assertAnotherPermanentAdmin(transaction, actor.businessId, user.id)
				}
				const { error } = await createAdminSupabaseClient().auth.admin.updateUserById(
					user.providerUserId,
					{ ban_duration: '876000h' }
				)
				if (error) throw new ApplicationError('AUTH_UNAVAILABLE', 'Identity disabling failed.')
				await transaction.applicationUser.update({
					where: { id: user.id },
					data: { status: 'DISABLED', disabledAt: new Date() }
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'access.identity.disabled',
						targetType: 'ApplicationUser',
						targetId: user.id,
						requestId: parsed.data.operationKey
					}
				})
				return { targetId: user.id, status: 'DISABLED' }
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function restoreIdentity(
	actor: Actor,
	input: IdentityMutationInput
): Promise<ActionResult<AccessMutationResult>> {
	const parsed = identityMutationInputSchema.safeParse(input)
	if (!parsed.success) {
		return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Check the identity.' } }
	}
	try {
		const result = await executeAccessMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: 'access.identity.restore',
			payload: { userId: parsed.data.userId },
			command: async (transaction) => {
				const user = await transaction.applicationUser.findFirst({
					where: {
						id: parsed.data.userId,
						OR: [
							{ staffGrants: { some: { businessId: actor.businessId } } },
							{ portalAccess: { businessId: actor.businessId } }
						]
					}
				})
				if (!user) throw new ApplicationError('NOT_FOUND', 'This identity does not exist.')
				const { error } = await createAdminSupabaseClient().auth.admin.updateUserById(
					user.providerUserId,
					{ ban_duration: 'none' }
				)
				if (error) throw new ApplicationError('AUTH_UNAVAILABLE', 'Identity restoring failed.')
				await transaction.applicationUser.update({
					where: { id: user.id },
					data: { status: 'ACTIVE', disabledAt: null }
				})
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'access.identity.restored',
						targetType: 'ApplicationUser',
						targetId: user.id,
						requestId: parsed.data.operationKey
					}
				})
				return { targetId: user.id, status: 'ACTIVE' }
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function revokeStaffGrant(
	actor: Actor,
	input: StaffGrantMutationInput
): Promise<ActionResult<AccessMutationResult>> {
	const parsed = staffGrantMutationInputSchema.safeParse(input)
	if (!parsed.success) {
		return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Check the staff grant.' } }
	}
	try {
		const result = await executeAccessMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: 'access.staff_grant.revoke',
			payload: { grantId: parsed.data.grantId },
			command: async (transaction) => {
				const grant = await transaction.staffGrant.findFirst({
					where: { id: parsed.data.grantId, businessId: actor.businessId }
				})
				if (!grant) throw new ApplicationError('NOT_FOUND', 'This staff grant does not exist.')
				if (
					grant.role === 'ADMIN' &&
					!grant.revokedAt &&
					grant.validFrom <= new Date() &&
					grant.validUntil === null
				) {
					await assertAnotherPermanentAdmin(transaction, actor.businessId, grant.userId)
				}
				if (!grant.revokedAt) {
					await transaction.staffGrant.update({
						where: { id: grant.id },
						data: { revokedAt: new Date() }
					})
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'access.staff_grant.revoked',
						targetType: 'StaffGrant',
						targetId: grant.id,
						requestId: parsed.data.operationKey
					}
				})
				return { targetId: grant.id, status: 'REVOKED' }
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function revokePortalAccess(
	actor: Actor,
	input: PortalAccessMutationInput
): Promise<ActionResult<AccessMutationResult>> {
	const parsed = portalAccessMutationInputSchema.safeParse(input)
	if (!parsed.success) {
		return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Check the portal access.' } }
	}
	try {
		const result = await executeAccessMutation({
			actor,
			operationKey: parsed.data.operationKey,
			operation: 'access.portal.revoke',
			payload: { portalAccessId: parsed.data.portalAccessId },
			command: async (transaction) => {
				const access = await transaction.portalAccess.findFirst({
					where: { id: parsed.data.portalAccessId, businessId: actor.businessId }
				})
				if (!access) throw new ApplicationError('NOT_FOUND', 'This portal access does not exist.')
				if (access.status !== 'REVOKED') {
					await transaction.portalAccess.update({
						where: { id: access.id },
						data: { status: 'REVOKED', revokedAt: new Date() }
					})
				}
				await transaction.auditEvent.create({
					data: {
						businessId: actor.businessId,
						actorUserId: actor.userId,
						action: 'access.portal.revoked',
						targetType: 'PortalAccess',
						targetId: access.id,
						requestId: parsed.data.operationKey
					}
				})
				return { targetId: access.id, status: 'REVOKED' }
			}
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}
