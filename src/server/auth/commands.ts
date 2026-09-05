import 'server-only'
import { createHash } from 'node:crypto'
import { createClient, type User } from '@supabase/supabase-js'
import { z } from 'zod'
import {
	loginInputSchema,
	passwordRecoveryInputSchema,
	signupInputSchema,
	type LoginInput,
	type LoginResult,
	type PasswordRecoveryInput,
	type SignupInput,
	type SignupResult
} from '@/lib/contracts/auth'
import type { ActionResult } from '@/lib/contracts/errors'
import { emailSchema, normalizeEmail, normalizeLoginId } from '@/lib/auth/credentials'
import { getPrisma } from '@/server/db/prisma'
import { getServerEnvironment } from '@/server/config/environment'
import { ApplicationError } from '@/server/errors/application-error'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/server/auth/supabase'

function validationError(error: z.ZodError) {
	return new ApplicationError(
		'VALIDATION_ERROR',
		'Check the highlighted fields.',
		z.flattenError(error).fieldErrors
	)
}

function safeReturnPath(returnTo: string | undefined, fallback: '/dashboard' | '/portal') {
	if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
		return fallback
	}

	if (fallback === '/portal' && !returnTo.startsWith('/portal')) {
		return fallback
	}

	if (fallback === '/dashboard' && returnTo.startsWith('/portal')) {
		return fallback
	}

	return returnTo
}

function requestHash(input: { displayName: string; loginId: string; email: string }) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				displayName: input.displayName.trim(),
				loginId: normalizeLoginId(input.loginId),
				email: normalizeEmail(input.email),
				kind: 'PUBLIC_ACCOUNTANT'
			})
		)
		.digest('hex')
}

function isUniqueConstraintFailure(error: unknown) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'P2002'
	)
}

function databaseUnavailable(message: string): ActionResult<never> {
	return { ok: false, error: { code: 'DATABASE_UNAVAILABLE', message } }
}

async function findAuthUserByEmail(email: string) {
	const admin = createAdminSupabaseClient()

	for (let page = 1; ; page += 1) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })

		if (error) {
			throw new ApplicationError('AUTH_UNAVAILABLE', 'Account creation is temporarily unavailable.')
		}

		const user = data.users.find((candidate) => normalizeEmail(candidate.email ?? '') === email)

		if (user) {
			return user
		}

		if (data.users.length < 100) {
			return null
		}
	}
}

async function createSignupIdentity(input: z.output<typeof signupInputSchema>): Promise<User> {
	const environment = getServerEnvironment()
	const existing = await findAuthUserByEmail(input.email)

	if (existing) {
		if (existing.user_metadata.provisioningOperationKey === input.operationKey) {
			return existing
		}

		throw new ApplicationError('VALIDATION_ERROR', 'Check the highlighted fields.', {
			email: ['Email is already in use.']
		})
	}

	const signupClient = createClient(
		environment.NEXT_PUBLIC_SUPABASE_URL,
		environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	)
	const { data, error } = await signupClient.auth.signUp({
		email: input.email,
		password: input.password,
		options: {
			emailRedirectTo: `${environment.APP_URL}/auth/callback?next=/dashboard`,
			data: {
				displayName: input.displayName,
				provisioningOperationKey: input.operationKey
			}
		}
	})

	if (error || !data.user) {
		throw new ApplicationError('AUTH_UNAVAILABLE', 'Account creation is temporarily unavailable.')
	}

	return data.user
}

export async function loginWithPassword(input: LoginInput): Promise<ActionResult<LoginResult>> {
	const parsed = loginInputSchema.safeParse(input)

	if (!parsed.success) {
		return { ok: false, error: validationError(parsed.error).toActionError() }
	}

	const normalizedLoginId = normalizeLoginId(parsed.data.loginId)
	let user

	try {
		user = await getPrisma().applicationUser.findUnique({
			where: { normalizedLoginId },
			include: { staffGrants: true, portalAccess: true }
		})
	} catch {
		return {
			ok: false,
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Sign in is unavailable while local services are stopped.'
			}
		}
	}

	if (!user) {
		return {
			ok: false,
			error: { code: 'UNAUTHENTICATED', message: 'Incorrect Login ID or password.' }
		}
	}

	const supabase = await createServerSupabaseClient()
	const { error } = await supabase.auth.signInWithPassword({
		email: user.normalizedEmail,
		password: parsed.data.password
	})

	if (error) {
		return {
			ok: false,
			error: { code: 'UNAUTHENTICATED', message: 'Incorrect Login ID or password.' }
		}
	}

	if (user.status !== 'ACTIVE' || user.disabledAt) {
		return { ok: true, data: { redirectTo: '/access-denied' } }
	}

	const now = new Date()
	const staffGrant = user.staffGrants.find(
		(grant) =>
			!grant.revokedAt && grant.validFrom <= now && (!grant.validUntil || grant.validUntil > now)
	)
	const destination = staffGrant
		? '/dashboard'
		: user.portalAccess?.status === 'ACTIVE'
			? '/portal'
			: '/access-denied'

	return {
		ok: true,
		data: {
			redirectTo:
				destination === '/access-denied'
					? destination
					: (safeReturnPath(parsed.data.returnTo, destination) as '/dashboard' | '/portal')
		}
	}
}

export async function signupAccountant(input: SignupInput): Promise<ActionResult<SignupResult>> {
	const parsed = signupInputSchema.safeParse(input)

	if (!parsed.success) {
		return { ok: false, error: validationError(parsed.error).toActionError() }
	}

	const prisma = getPrisma()
	const normalizedLoginId = normalizeLoginId(parsed.data.loginId)
	const normalizedEmail = normalizeEmail(parsed.data.email)
	const hash = requestHash(parsed.data)
	let business
	let operation

	try {
		business = await prisma.business.findUnique({ where: { slug: 'urbanledger' } })
		operation = await prisma.provisioningOperation.findUnique({
			where: { operationKey: parsed.data.operationKey }
		})
	} catch {
		return databaseUnavailable('Account creation is unavailable while local services are stopped.')
	}

	if (!business) {
		return {
			ok: false,
			error: { code: 'INVALID_STATE', message: 'UrbanLedger setup must be completed first.' }
		}
	}

	if (operation && operation.requestHash !== hash) {
		return {
			ok: false,
			error: {
				code: 'OPERATION_KEY_MISMATCH',
				message: 'This signup request was already used with different details.'
			}
		}
	}

	if (operation?.state === 'COMPLETED') {
		return {
			ok: true,
			data: { loginId: parsed.data.loginId, confirmationRequired: true }
		}
	}

	try {
		const existingUser = await prisma.applicationUser.findFirst({
			where: { OR: [{ normalizedLoginId }, { normalizedEmail }] }
		})

		if (existingUser && existingUser.providerUserId !== operation?.providerUserId) {
			return {
				ok: false,
				error: {
					code: 'VALIDATION_ERROR',
					message: 'Login ID or email is already in use.',
					fieldErrors: {
						...(existingUser.normalizedLoginId === normalizedLoginId
							? { loginId: ['Login ID must be unique.'] }
							: {}),
						...(existingUser.normalizedEmail === normalizedEmail
							? { email: ['Email must be unique.'] }
							: {})
					}
				}
			}
		}
	} catch {
		return databaseUnavailable('Account creation is unavailable while local services are stopped.')
	}

	try {
		operation ??= await prisma.provisioningOperation.create({
			data: {
				businessId: business.id,
				operationKey: parsed.data.operationKey,
				kind: 'PUBLIC_ACCOUNTANT',
				normalizedLoginId,
				normalizedEmail,
				requestHash: hash
			}
		})
	} catch (error) {
		if (!isUniqueConstraintFailure(error)) {
			return databaseUnavailable(
				'Account creation is unavailable while local services are stopped.'
			)
		}

		try {
			operation = await prisma.provisioningOperation.findUnique({
				where: { operationKey: parsed.data.operationKey }
			})
		} catch {
			return databaseUnavailable(
				'Account creation is unavailable while local services are stopped.'
			)
		}

		if (operation?.requestHash === hash) {
			return signupAccountant(parsed.data)
		}

		return {
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Login ID or email is already in use.',
				fieldErrors: {
					loginId: ['Login ID must be unique.'],
					email: ['Email must be unique.']
				}
			}
		}
	}

	let providerUserId = operation.providerUserId

	try {
		if (!providerUserId) {
			const providerUser = await createSignupIdentity(parsed.data)
			providerUserId = providerUser.id
			await prisma.provisioningOperation.update({
				where: { id: operation.id },
				data: { providerUserId, state: 'AUTH_CREATED', safeFailureCode: null }
			})
		}

		if (!providerUserId) {
			throw new ApplicationError('AUTH_UNAVAILABLE', 'Account creation is temporarily unavailable.')
		}

		const resolvedProviderUserId = providerUserId

		await prisma.$transaction(async (transaction) => {
			const user = await transaction.applicationUser.upsert({
				where: { normalizedLoginId },
				update: {
					providerUserId: resolvedProviderUserId,
					loginId: parsed.data.loginId,
					normalizedEmail,
					displayName: parsed.data.displayName,
					status: 'ACTIVE',
					disabledAt: null
				},
				create: {
					providerUserId: resolvedProviderUserId,
					loginId: parsed.data.loginId,
					normalizedLoginId,
					normalizedEmail,
					displayName: parsed.data.displayName,
					status: 'ACTIVE'
				}
			})

			await transaction.staffGrant.upsert({
				where: {
					userId_businessId_role: {
						userId: user.id,
						businessId: business.id,
						role: 'ACCOUNTANT'
					}
				},
				update: { revokedAt: null, validUntil: null },
				create: { userId: user.id, businessId: business.id, role: 'ACCOUNTANT' }
			})

			await transaction.provisioningOperation.update({
				where: { id: operation.id },
				data: { state: 'COMPLETED', safeFailureCode: null }
			})
		})
	} catch (error) {
		try {
			await prisma.provisioningOperation.update({
				where: { id: operation.id },
				data: {
					state: providerUserId ? 'AUTH_CREATED' : 'FAILED',
					safeFailureCode: error instanceof ApplicationError ? error.code : 'PROVISIONING_FAILED'
				}
			})
		} catch {}

		if (error instanceof ApplicationError) {
			return { ok: false, error: error.toActionError() }
		}

		return {
			ok: false,
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Account creation is incomplete. Retry with the same form details.'
			}
		}
	}

	return {
		ok: true,
		data: { loginId: parsed.data.loginId, confirmationRequired: true }
	}
}

export async function requestPasswordReset(email: string): Promise<ActionResult<null>> {
	const parsed = emailSchema.safeParse(email)

	if (parsed.success) {
		try {
			const environment = getServerEnvironment()
			const supabase = await createServerSupabaseClient()
			await supabase.auth.resetPasswordForEmail(parsed.data, {
				redirectTo: `${environment.APP_URL}/auth/callback?next=/reset-password`
			})
		} catch {}
	}

	return { ok: true, data: null }
}

export async function updateRecoveredPassword(
	input: PasswordRecoveryInput
): Promise<ActionResult<null>> {
	const parsed = passwordRecoveryInputSchema.safeParse(input)

	if (!parsed.success) {
		return { ok: false, error: validationError(parsed.error).toActionError() }
	}

	const supabase = await createServerSupabaseClient()
	const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

	if (error) {
		return {
			ok: false,
			error: { code: 'UNAUTHENTICATED', message: 'Request a new password recovery link.' }
		}
	}

	const { data } = await supabase.auth.getUser()
	if (data.user) {
		await getPrisma().applicationUser.updateMany({
			where: { providerUserId: data.user.id },
			data: { mustChangePassword: false }
		})
	}

	return { ok: true, data: null }
}

export async function logout() {
	const supabase = await createServerSupabaseClient()
	await supabase.auth.signOut()
}
