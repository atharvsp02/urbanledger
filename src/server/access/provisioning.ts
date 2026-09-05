import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { User } from '@supabase/supabase-js'
import type { Actor } from '@/lib/contracts/access'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	createAdministratorInputSchema,
	createContactUserInputSchema,
	resolvePortalIdentityConflictInputSchema,
	retryPortalProvisioningInputSchema,
	type AccessUser,
	type CreateAdministratorInput,
	type CreateContactUserInput,
	type ResolvePortalIdentityConflictInput,
	type RetryPortalProvisioningInput
} from '@/lib/contracts/access-administration'
import { normalizeEmail, normalizeLoginId } from '@/lib/auth/credentials'
import { requireCurrentAccountingActor } from '@/server/accounting/authorize'
import { loadAccessUser } from '@/server/access/read-models'
import { createAdminSupabaseClient } from '@/server/auth/supabase'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

type ProvisioningKind = 'ADMIN' | 'CONTACT'

type ProvisioningInput = {
	operationKey: string
	kind: ProvisioningKind
	contactId: string | null
	displayName: string
	loginId: string
	email: string
	password: string
}

function validationFailure(error: z.ZodError): ActionResult<never> {
	return {
		ok: false,
		error: new ApplicationError(
			'VALIDATION_ERROR',
			'Check the access details.',
			z.flattenError(error).fieldErrors
		).toActionError()
	}
}

function actionFailure(error: unknown, requestId?: string): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError(requestId) }
	}
	return {
		ok: false,
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'Access provisioning could not be completed.',
			...(requestId ? { requestId } : {})
		}
	}
}

function provisioningHash(input: ProvisioningInput) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				kind: input.kind,
				contactId: input.contactId,
				displayName: input.displayName.trim(),
				loginId: normalizeLoginId(input.loginId),
				email: normalizeEmail(input.email)
			})
		)
		.digest('hex')
}

async function findProviderIdentity(email: string, operationKey: string) {
	const admin = createAdminSupabaseClient()
	for (let page = 1; ; page += 1) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
		if (error) throw new ApplicationError('AUTH_UNAVAILABLE', 'Identity service is unavailable.')
		const identity = data.users.find(
			(candidate) => normalizeEmail(candidate.email ?? '') === normalizeEmail(email)
		)
		if (identity) {
			if (identity.user_metadata.provisioningOperationKey === operationKey) return identity
			throw new ApplicationError('CONFLICT', 'Identity email is already in use.')
		}
		if (data.users.length < 100) return null
	}
}

async function createProviderIdentity(input: ProvisioningInput): Promise<User> {
	const existing = await findProviderIdentity(input.email, input.operationKey)
	if (existing) return existing
	const { data, error } = await createAdminSupabaseClient().auth.admin.createUser({
		email: normalizeEmail(input.email),
		password: input.password,
		email_confirm: true,
		user_metadata: {
			displayName: input.displayName,
			provisioningOperationKey: input.operationKey
		}
	})
	if (error || !data.user) {
		throw new ApplicationError('AUTH_UNAVAILABLE', 'Identity creation is unavailable.')
	}
	return data.user
}

async function provisionAccess(actor: Actor, input: ProvisioningInput): Promise<AccessUser> {
	const prisma = getPrisma()
	const normalizedLoginId = normalizeLoginId(input.loginId)
	const normalizedEmail = normalizeEmail(input.email)
	const hash = provisioningHash(input)
	const prepared = await prisma.$transaction(async (transaction) => {
		await requireCurrentAccountingActor(transaction, actor, 'access:manage')
		const contact = input.contactId
			? await transaction.contact.findFirst({
					where: { id: input.contactId, businessId: actor.businessId },
					include: { portalAccess: true }
				})
			: null
		if (input.kind === 'CONTACT' && !contact) {
			throw new ApplicationError('NOT_FOUND', 'This Contact does not exist.')
		}
		const operation = await transaction.provisioningOperation.findUnique({
			where: { operationKey: input.operationKey }
		})
		if (operation && operation.requestHash !== hash) {
			throw new ApplicationError(
				'OPERATION_KEY_MISMATCH',
				'This operation key was already used with different access details.'
			)
		}
		if (operation?.state === 'COMPLETED' && operation.providerUserId) {
			return { operation, completedUserId: operation.providerUserId, contact }
		}
		if (contact?.portalAccess) {
			throw new ApplicationError(
				'CONFLICT',
				'This Contact already has portal access. Rebinding is not automatic.'
			)
		}
		const conflict = await transaction.applicationUser.findFirst({
			where: { OR: [{ normalizedLoginId }, { normalizedEmail }] }
		})
		if (conflict && conflict.providerUserId !== operation?.providerUserId) {
			throw new ApplicationError('CONFLICT', 'Login ID or identity email is already in use.')
		}
		const currentOperation =
			operation ??
			(await transaction.provisioningOperation.create({
				data: {
					businessId: actor.businessId,
					actorUserId: actor.userId,
					contactId: input.contactId,
					operationKey: input.operationKey,
					kind: input.kind,
					normalizedLoginId,
					normalizedEmail,
					requestHash: hash
				}
			}))
		return { operation: currentOperation, completedUserId: null, contact }
	})

	if (prepared.completedUserId) {
		const user = await prisma.applicationUser.findUnique({
			where: { providerUserId: prepared.completedUserId },
			select: { id: true }
		})
		if (!user) throw new ApplicationError('INVALID_STATE', 'Completed access is inconsistent.')
		return prisma.$transaction((transaction) =>
			loadAccessUser(transaction, actor.businessId, user.id)
		)
	}

	let providerUserId = prepared.operation.providerUserId
	try {
		if (!providerUserId) {
			const provider = await createProviderIdentity(input)
			providerUserId = provider.id
			await prisma.provisioningOperation.update({
				where: { id: prepared.operation.id },
				data: { providerUserId, state: 'AUTH_CREATED', safeFailureCode: null }
			})
		}

		const resolvedProviderUserId = providerUserId
		if (!resolvedProviderUserId) {
			throw new ApplicationError('AUTH_UNAVAILABLE', 'Identity creation did not finish.')
		}
		return await prisma.$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'access:manage')
			let user = await transaction.applicationUser.findUnique({
				where: { providerUserId: resolvedProviderUserId }
			})
			if (
				user &&
				(user.normalizedLoginId !== normalizedLoginId || user.normalizedEmail !== normalizedEmail)
			) {
				throw new ApplicationError(
					'CONFLICT',
					'An existing identity cannot be rebound automatically.'
				)
			}
			user ??= await transaction.applicationUser.create({
				data: {
					providerUserId: resolvedProviderUserId,
					loginId: input.loginId,
					normalizedLoginId,
					normalizedEmail,
					displayName: input.displayName,
					status: 'ACTIVE',
					mustChangePassword: true
				}
			})

			if (input.kind === 'ADMIN') {
				await transaction.staffGrant.upsert({
					where: {
						userId_businessId_role: {
							userId: user.id,
							businessId: actor.businessId,
							role: 'ADMIN'
						}
					},
					update: { revokedAt: null, validUntil: null },
					create: {
						userId: user.id,
						businessId: actor.businessId,
						role: 'ADMIN',
						grantedById: actor.userId
					}
				})
			} else {
				if (!input.contactId)
					throw new ApplicationError('INVALID_STATE', 'Contact link is required.')
				const existingAccess = await transaction.portalAccess.findUnique({
					where: { contactId: input.contactId }
				})
				if (existingAccess && existingAccess.userId !== user.id) {
					throw new ApplicationError('CONFLICT', 'Existing portal access cannot be rebound.')
				}
				if (!existingAccess) {
					await transaction.portalAccess.create({
						data: {
							userId: user.id,
							businessId: actor.businessId,
							contactId: input.contactId,
							grantedById: actor.userId
						}
					})
				}
			}

			await transaction.provisioningOperation.update({
				where: { id: prepared.operation.id },
				data: { state: 'COMPLETED', safeFailureCode: null }
			})
			await transaction.auditEvent.create({
				data: {
					businessId: actor.businessId,
					actorUserId: actor.userId,
					action:
						input.kind === 'ADMIN' ? 'access.administrator.created' : 'access.contact.created',
					targetType: 'ApplicationUser',
					targetId: user.id,
					requestId: input.operationKey,
					details: input.contactId ? { contactId: input.contactId } : undefined
				}
			})
			return loadAccessUser(transaction, actor.businessId, user.id)
		})
	} catch (error) {
		await prisma.provisioningOperation
			.update({
				where: { id: prepared.operation.id },
				data: {
					state: providerUserId ? 'AUTH_CREATED' : 'FAILED',
					safeFailureCode: error instanceof ApplicationError ? error.code : 'PROVISIONING_FAILED'
				}
			})
			.catch(() => undefined)
		throw error
	}
}

export async function createAdministrator(
	actor: Actor,
	input: CreateAdministratorInput
): Promise<ActionResult<AccessUser>> {
	const parsed = createAdministratorInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const result = await provisionAccess(actor, {
			operationKey: parsed.data.operationKey,
			kind: 'ADMIN',
			contactId: null,
			displayName: parsed.data.displayName,
			loginId: parsed.data.loginId,
			email: parsed.data.email,
			password: parsed.data.password
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function createContactUser(
	actor: Actor,
	input: CreateContactUserInput
): Promise<ActionResult<AccessUser>> {
	const parsed = createContactUserInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const contact = await getPrisma().contact.findFirst({
			where: { id: parsed.data.contactId, businessId: actor.businessId },
			select: { name: true }
		})
		if (!contact) throw new ApplicationError('NOT_FOUND', 'This Contact does not exist.')
		const result = await provisionAccess(actor, {
			operationKey: parsed.data.operationKey,
			kind: 'CONTACT',
			contactId: parsed.data.contactId,
			displayName: contact.name,
			loginId: parsed.data.loginId,
			email: parsed.data.email,
			password: parsed.data.password
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function retryPortalProvisioning(
	actor: Actor,
	input: RetryPortalProvisioningInput
): Promise<ActionResult<AccessUser>> {
	const parsed = retryPortalProvisioningInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		const prepared = await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'access:manage')
			const operation = await transaction.provisioningOperation.findFirst({
				where: {
					operationKey: parsed.data.operationKey,
					businessId: actor.businessId,
					kind: 'CONTACT'
				},
				include: { contact: { select: { name: true } } }
			})
			if (!operation || !operation.contactId || !operation.contact) {
				throw new ApplicationError(
					'NOT_FOUND',
					'This portal provisioning operation cannot be retried.'
				)
			}
			return operation
		})
		const result = await provisionAccess(actor, {
			operationKey: prepared.operationKey,
			kind: 'CONTACT',
			contactId: prepared.contactId!,
			displayName: prepared.contact!.name,
			loginId: prepared.normalizedLoginId,
			email: prepared.normalizedEmail,
			password: parsed.data.password
		})
		return { ok: true, data: result, requestId: parsed.data.operationKey }
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}

export async function resolvePortalIdentityConflict(
	actor: Actor,
	input: ResolvePortalIdentityConflictInput
): Promise<ActionResult<AccessUser>> {
	const parsed = resolvePortalIdentityConflictInputSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	try {
		await getPrisma().$transaction(async (transaction) => {
			await requireCurrentAccountingActor(transaction, actor, 'access:manage')
			const conflict = await transaction.provisioningOperation.findFirst({
				where: {
					operationKey: parsed.data.conflictedOperationKey,
					businessId: actor.businessId,
					contactId: parsed.data.contactId,
					kind: 'CONTACT',
					state: 'FAILED'
				}
			})
			if (!conflict)
				throw new ApplicationError('NOT_FOUND', 'This identity conflict was not found.')
		})
		const result = await createContactUser(actor, {
			operationKey: parsed.data.operationKey,
			contactId: parsed.data.contactId,
			loginId: parsed.data.loginId,
			email: parsed.data.email,
			password: parsed.data.password,
			passwordConfirmation: parsed.data.passwordConfirmation
		})
		if (!result.ok) return result
		await getPrisma().provisioningOperation.update({
			where: { operationKey: parsed.data.conflictedOperationKey },
			data: { safeFailureCode: 'IDENTITY_CONFLICT_RESOLVED' }
		})
		return result
	} catch (error) {
		return actionFailure(error, parsed.data.operationKey)
	}
}
