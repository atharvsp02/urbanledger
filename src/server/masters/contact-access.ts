import 'server-only'
import { createHash } from 'node:crypto'
import { normalizeEmail, normalizeLoginId } from '@/lib/auth/credentials'
import {
	contactAccessInputSchema,
	type ContactAccessInput,
	type ContactAccessResult
} from '@/lib/masters/contact-access'
import { requireActor } from '@/server/auth/actor'
import { createAdminSupabaseClient } from '@/server/auth/supabase'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

// The operation identity is derived from the Contact UUID, so a retry always
// resumes the same operation and the browser cannot choose it.
const CONTACT_PROVISIONING_NAMESPACE = '6f1c1f2c-2b6f-4d1a-9c9a-0f2f6f6a1b21'

export function contactProvisioningKey(contactId: string) {
	const namespace = Buffer.from(CONTACT_PROVISIONING_NAMESPACE.replaceAll('-', ''), 'hex')
	const digest = createHash('sha1')
		.update(Buffer.concat([namespace, Buffer.from(contactId, 'utf8')]))
		.digest()
	digest[6] = (digest[6] & 0x0f) | 0x50
	digest[8] = (digest[8] & 0x3f) | 0x80
	const hex = digest.subarray(0, 16).toString('hex')

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function requestHash(input: { contactId: string; loginId: string; email: string }) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				kind: 'CONTACT',
				contactId: input.contactId,
				loginId: normalizeLoginId(input.loginId),
				email: normalizeEmail(input.email)
			})
		)
		.digest('hex')
}

async function createPortalIdentity(input: {
	email: string
	password: string
	displayName: string
	operationKey: string
}) {
	const admin = createAdminSupabaseClient()
	const { data, error } = await admin.auth.admin.createUser({
		email: input.email,
		password: input.password,
		email_confirm: true,
		user_metadata: {
			displayName: input.displayName,
			provisioningOperationKey: input.operationKey
		}
	})

	if (error || !data.user) {
		throw new ApplicationError(
			'AUTH_UNAVAILABLE',
			'Portal access could not be created. Retry with the same details.'
		)
	}

	return data.user
}

export async function enableContactPortalAccess(
	input: ContactAccessInput
): Promise<ContactAccessResult> {
	const actor = await requireActor('contact-access:create')
	const parsed = contactAccessInputSchema.parse(input)
	const prisma = getPrisma()
	const normalizedLoginId = normalizeLoginId(parsed.loginId)
	const normalizedEmail = normalizeEmail(parsed.email)
	const hash = requestHash(parsed)
	const operationKey = contactProvisioningKey(parsed.contactId)

	const contact = await prisma.contact.findFirst({
		where: { id: parsed.contactId, businessId: actor.businessId },
		select: { id: true, name: true, portalAccess: { select: { id: true, status: true } } }
	})

	if (!contact) {
		throw new ApplicationError('NOT_FOUND', 'This contact does not exist.')
	}

	if (contact.portalAccess) {
		throw new ApplicationError(
			'CONFLICT',
			'This contact already has portal access. An administrator must resolve it.'
		)
	}

	let operation = await prisma.provisioningOperation.findUnique({
		where: { operationKey }
	})

	if (operation && operation.requestHash !== hash) {
		throw new ApplicationError(
			'OPERATION_KEY_MISMATCH',
			'This access request was already used with different details.'
		)
	}

	if (operation?.state === 'COMPLETED') {
		return { contactId: contact.id, loginId: parsed.loginId }
	}

	const conflicting = await prisma.applicationUser.findFirst({
		where: { OR: [{ normalizedLoginId }, { normalizedEmail }] },
		select: { normalizedLoginId: true, normalizedEmail: true, providerUserId: true }
	})

	if (conflicting && conflicting.providerUserId !== operation?.providerUserId) {
		throw new ApplicationError(
			'CONFLICT',
			'Login ID or identity email is already in use. An administrator must resolve it.',
			{
				...(conflicting.normalizedLoginId === normalizedLoginId
					? { loginId: ['Login ID is already in use.'] }
					: {}),
				...(conflicting.normalizedEmail === normalizedEmail
					? { email: ['Identity email is already in use.'] }
					: {})
			}
		)
	}

	operation ??= await prisma.provisioningOperation.create({
		data: {
			businessId: actor.businessId,
			actorUserId: actor.userId,
			operationKey,
			kind: 'CONTACT',
			normalizedLoginId,
			normalizedEmail,
			requestHash: hash
		}
	})

	let providerUserId = operation.providerUserId

	try {
		if (!providerUserId) {
			const identity = await createPortalIdentity({
				email: normalizedEmail,
				password: parsed.password,
				displayName: contact.name,
				operationKey
			})
			providerUserId = identity.id
			await prisma.provisioningOperation.update({
				where: { id: operation.id },
				data: { providerUserId, state: 'AUTH_CREATED', safeFailureCode: null }
			})
		}

		const resolvedProviderUserId = providerUserId

		await prisma.$transaction(async (transaction) => {
			const user = await transaction.applicationUser.upsert({
				where: { normalizedLoginId },
				update: {
					providerUserId: resolvedProviderUserId,
					loginId: parsed.loginId,
					normalizedEmail,
					displayName: contact.name,
					status: 'ACTIVE',
					disabledAt: null
				},
				create: {
					providerUserId: resolvedProviderUserId,
					loginId: parsed.loginId,
					normalizedLoginId,
					normalizedEmail,
					displayName: contact.name,
					status: 'ACTIVE'
				}
			})

			await transaction.portalAccess.create({
				data: {
					userId: user.id,
					businessId: actor.businessId,
					contactId: contact.id,
					grantedById: actor.userId
				}
			})

			await transaction.provisioningOperation.update({
				where: { id: operation.id },
				data: { state: 'COMPLETED', safeFailureCode: null }
			})
		})
	} catch (error) {
		await prisma.provisioningOperation
			.update({
				where: { id: operation.id },
				data: {
					state: providerUserId ? 'AUTH_CREATED' : 'FAILED',
					safeFailureCode: error instanceof ApplicationError ? error.code : 'PROVISIONING_FAILED'
				}
			})
			.catch(() => undefined)

		if (error instanceof ApplicationError) throw error

		throw new ApplicationError(
			'DATABASE_UNAVAILABLE',
			'Portal access is incomplete. Retry with the same details.'
		)
	}

	return { contactId: contact.id, loginId: parsed.loginId }
}
