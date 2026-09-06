import 'server-only'
import { randomUUID } from 'node:crypto'
import type { Actor, Capability } from '@/lib/contracts/access'
import { getActor } from '@/server/auth/actor'
import { createAdminSupabaseClient } from '@/server/auth/supabase'
import { getServerEnvironment } from '@/server/config/environment'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { inspectImage } from '@/server/masters/image-inspection'

export const MAXIMUM_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
const MAXIMUM_DIMENSION = 8000
const SIGNED_URL_SECONDS = 60

function storageBucket() {
	return getServerEnvironment().SUPABASE_STORAGE_BUCKET
}

function authorizeContactImage(actor: Actor, contactId: string, capability: Capability) {
	const isOwnPortalProfile = actor.role === 'CONTACT' && actor.contactId === contactId
	if (!isOwnPortalProfile && !actor.capabilities.includes(capability)) {
		throw new ApplicationError('FORBIDDEN', 'You do not have permission to manage this photo.')
	}
}

// Signed URLs are short-lived and minted per request; the bucket stays private
// and the service key never leaves the server.
export async function createContactImageUrl(storageKey: string) {
	const { data, error } = await createAdminSupabaseClient()
		.storage.from(storageBucket())
		.createSignedUrl(storageKey, SIGNED_URL_SECONDS)

	if (error || !data) {
		throw new ApplicationError('STORAGE_UNAVAILABLE', 'The image could not be loaded.')
	}

	return data.signedUrl
}

export async function getContactImage(contactId: string) {
	return getContactImageForActor(await getActor(), contactId)
}

export async function getContactImageForActor(actor: Actor, contactId: string) {
	authorizeContactImage(actor, contactId, 'contacts:read')
	const contact = await getPrisma().contact.findFirst({
		where: { id: contactId, businessId: actor.businessId },
		select: { imageAsset: { select: { id: true, storageKey: true, mimeType: true } } }
	})

	if (!contact?.imageAsset) return null

	return {
		id: contact.imageAsset.id,
		url: await createContactImageUrl(contact.imageAsset.storageKey)
	}
}

export async function replaceContactImage(contactId: string, file: File) {
	return replaceContactImageForActor(await getActor(), contactId, file)
}

export async function replaceContactImageForActor(actor: Actor, contactId: string, file: File) {
	authorizeContactImage(actor, contactId, 'contacts:update')

	if (file.size === 0) {
		throw new ApplicationError('VALIDATION_ERROR', 'Choose an image to upload.', {
			image: ['Choose an image to upload.']
		})
	}

	if (file.size > MAXIMUM_IMAGE_BYTES) {
		throw new ApplicationError('VALIDATION_ERROR', 'That image is too large.', {
			image: ['Use an image of 5 MiB or less.']
		})
	}

	const bytes = Buffer.from(await file.arrayBuffer())
	const inspected = inspectImage(bytes)

	if (!inspected || !ACCEPTED_IMAGE_TYPES.includes(inspected.mimeType)) {
		throw new ApplicationError('VALIDATION_ERROR', 'That file is not a supported image.', {
			image: ['Use a JPEG, PNG or WebP image.']
		})
	}

	if (
		inspected.width < 1 ||
		inspected.height < 1 ||
		inspected.width > MAXIMUM_DIMENSION ||
		inspected.height > MAXIMUM_DIMENSION
	) {
		throw new ApplicationError('VALIDATION_ERROR', 'That image is outside the supported size.', {
			image: [`Use an image up to ${MAXIMUM_DIMENSION} pixels on each side.`]
		})
	}

	const prisma = getPrisma()
	const contact = await prisma.contact.findFirst({
		where: { id: contactId, businessId: actor.businessId },
		select: { id: true, imageAsset: { select: { id: true, storageKey: true } } }
	})

	if (!contact) {
		throw new ApplicationError('NOT_FOUND', 'This contact does not exist.')
	}

	const storage = createAdminSupabaseClient().storage.from(storageBucket())
	const storageKey = `${actor.businessId}/contacts/${contactId}/${randomUUID()}.${EXTENSIONS[inspected.mimeType]}`
	const upload = await storage.upload(storageKey, bytes, {
		contentType: inspected.mimeType,
		upsert: false
	})

	if (upload.error) {
		throw new ApplicationError('STORAGE_UNAVAILABLE', 'The image could not be stored.')
	}

	const previous = contact.imageAsset

	try {
		await prisma.$transaction(async (transaction) => {
			const asset = await transaction.fileAsset.create({
				data: {
					businessId: actor.businessId,
					storageKey,
					mimeType: inspected.mimeType,
					byteSize: bytes.byteLength,
					width: inspected.width,
					height: inspected.height,
					verifiedAt: new Date()
				},
				select: { id: true }
			})

			await transaction.contact.update({
				where: { id: contactId },
				data: { imageAssetId: asset.id }
			})

			if (previous) {
				await transaction.fileAsset.delete({ where: { id: previous.id } })
			}
		})
	} catch (cause) {
		// The database is the record of truth: an object that never became a
		// FileAsset must not survive the failed write.
		await storage.remove([storageKey])
		throw new ApplicationError('DATABASE_UNAVAILABLE', 'The image could not be saved.', undefined, {
			cause
		})
	}

	if (previous) {
		await storage.remove([previous.storageKey])
	}

	return { url: await createContactImageUrl(storageKey) }
}

export async function removeContactImage(contactId: string) {
	return removeContactImageForActor(await getActor(), contactId)
}

export async function removeContactImageForActor(actor: Actor, contactId: string) {
	authorizeContactImage(actor, contactId, 'contacts:update')
	const prisma = getPrisma()
	const contact = await prisma.contact.findFirst({
		where: { id: contactId, businessId: actor.businessId },
		select: { imageAsset: { select: { id: true, storageKey: true } } }
	})

	if (!contact) {
		throw new ApplicationError('NOT_FOUND', 'This contact does not exist.')
	}

	if (!contact.imageAsset) return { id: contactId }

	const { id, storageKey } = contact.imageAsset

	await prisma.$transaction(async (transaction) => {
		await transaction.contact.update({ where: { id: contactId }, data: { imageAssetId: null } })
		await transaction.fileAsset.delete({ where: { id } })
	})

	await createAdminSupabaseClient().storage.from(storageBucket()).remove([storageKey])

	return { id: contactId }
}
