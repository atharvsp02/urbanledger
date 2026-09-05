import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import {
	contactInputSchema,
	contactListQuerySchema,
	type ContactDetail,
	type ContactInput,
	type ContactListQuery,
	type ContactPortalState,
	type ContactSummary
} from '@/lib/masters/contact'
import { requireActor } from '@/server/auth/actor'
import { contactProvisioningKey } from '@/server/masters/contact-access'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { resolvePage, type PageResult } from '@/server/masters/pagination'

type ContactRow = Prisma.ContactModel & {
	portalAccess: { status: 'ACTIVE' | 'REVOKED' } | null
}

function portalStateOf(
	portalAccess: { status: 'ACTIVE' | 'REVOKED' } | null,
	operationState?: 'PENDING' | 'AUTH_CREATED' | 'COMPLETED' | 'FAILED' | null
): ContactPortalState {
	if (portalAccess?.status === 'ACTIVE') return 'active'
	if (portalAccess?.status === 'REVOKED') return 'revoked'
	if (operationState === 'FAILED') return 'failed'
	if (operationState === 'PENDING' || operationState === 'AUTH_CREATED') return 'pending'
	return 'none'
}

function toSummary(contact: ContactRow): ContactSummary {
	return {
		id: contact.id,
		name: contact.name,
		kind: contact.kind,
		email: contact.email,
		mobile: contact.mobile,
		city: contact.city,
		state: contact.state,
		archivedAt: contact.archivedAt?.toISOString().slice(0, 10) ?? null,
		revision: contact.revision,
		portalState: portalStateOf(contact.portalAccess)
	}
}

export async function listContacts(query: ContactListQuery): Promise<PageResult<ContactSummary>> {
	const actor = await requireActor('contacts:read')
	const parsed = contactListQuerySchema.parse(query)
	const prisma = getPrisma()

	const where: Prisma.ContactWhereInput = {
		businessId: actor.businessId,
		...(parsed.includeArchived ? {} : { archivedAt: null }),
		...(parsed.kind === 'ALL' ? {} : { kind: parsed.kind }),
		...(parsed.search === ''
			? {}
			: {
					OR: [
						{ name: { contains: parsed.search, mode: 'insensitive' } },
						{ email: { contains: parsed.search, mode: 'insensitive' } },
						{ city: { contains: parsed.search, mode: 'insensitive' } }
					]
				})
	}

	const totalCount = await prisma.contact.count({ where })
	const { page, lastPage } = resolvePage(parsed.page, parsed.pageSize, totalCount)
	const rows = await prisma.contact.findMany({
		where,
		include: { portalAccess: { select: { status: true } } },
		orderBy: [{ [parsed.sort]: parsed.direction }, { id: 'asc' }],
		skip: (page - 1) * parsed.pageSize,
		take: parsed.pageSize
	})

	return {
		rows: rows.map(toSummary),
		totalCount,
		page,
		pageSize: parsed.pageSize,
		lastPage
	}
}

export async function getContactDetail(contactId: string): Promise<ContactDetail> {
	const actor = await requireActor('contacts:read')
	const prisma = getPrisma()
	const contact = await prisma.contact.findFirst({
		where: { id: contactId, businessId: actor.businessId },
		include: { portalAccess: { select: { status: true, user: { select: { loginId: true } } } } }
	})

	if (!contact) {
		throw new ApplicationError('NOT_FOUND', 'This contact does not exist.')
	}

	const operation = await prisma.provisioningOperation.findUnique({
		where: { operationKey: contactProvisioningKey(contactId) }
	})

	return {
		...toSummary(contact),
		portalState: portalStateOf(contact.portalAccess, operation?.state),
		street: contact.street,
		pincode: contact.pincode,
		imageAssetId: contact.imageAssetId,
		portalLoginId: contact.portalAccess?.user.loginId ?? null,
		portalFailureCode: operation?.safeFailureCode ?? null
	}
}

export async function createContact(input: ContactInput) {
	const actor = await requireActor('contacts:create')
	const parsed = contactInputSchema.parse(input)

	return getPrisma().contact.create({
		data: { ...parsed, businessId: actor.businessId },
		select: { id: true }
	})
}

export async function updateContact(contactId: string, revision: number, input: ContactInput) {
	const actor = await requireActor('contacts:update')
	const parsed = contactInputSchema.parse(input)
	const prisma = getPrisma()

	const result = await prisma.contact.updateMany({
		where: { id: contactId, businessId: actor.businessId, revision },
		data: { ...parsed, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		await assertContactExists(prisma, contactId, actor.businessId)
		throw new ApplicationError(
			'STALE_REVISION',
			'This contact changed while you were editing. Reload it and review the current values.'
		)
	}

	return { id: contactId }
}

export async function setContactArchived(contactId: string, revision: number, isArchived: boolean) {
	const actor = await requireActor('masters:archive')
	const prisma = getPrisma()

	const result = await prisma.contact.updateMany({
		where: { id: contactId, businessId: actor.businessId, revision },
		data: { archivedAt: isArchived ? new Date() : null, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		await assertContactExists(prisma, contactId, actor.businessId)
		throw new ApplicationError(
			'STALE_REVISION',
			'This contact changed while you were viewing it. Reload it and try again.'
		)
	}

	return { id: contactId }
}

async function assertContactExists(
	prisma: ReturnType<typeof getPrisma>,
	contactId: string,
	businessId: string
) {
	const exists = await prisma.contact.findFirst({
		where: { id: contactId, businessId },
		select: { id: true }
	})

	if (!exists) {
		throw new ApplicationError('NOT_FOUND', 'This contact does not exist.')
	}
}

export async function listSelectableVendors() {
	const actor = await requireActor('contacts:read')
	const rows = await getPrisma().contact.findMany({
		where: { businessId: actor.businessId, archivedAt: null, kind: { in: ['VENDOR', 'BOTH'] } },
		select: { id: true, name: true, kind: true },
		orderBy: [{ name: 'asc' }, { id: 'asc' }]
	})

	return rows
}
