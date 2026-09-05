import 'server-only'
import type { Actor } from '@/lib/contracts/access'
import type { Prisma } from '@/generated/prisma/client'
import {
	analyticAccountInputSchema,
	analyticAccountListQuerySchema,
	type AnalyticAccountDetail,
	type AnalyticAccountInput,
	type AnalyticAccountListQuery,
	type AnalyticAccountSummary
} from '@/lib/masters/analytic-account'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { assertCapability } from '@/server/masters/authorize'
import { resolvePage, type PageResult } from '@/server/masters/pagination'

function toSummary(account: Prisma.AnalyticAccountModel): AnalyticAccountSummary {
	return {
		id: account.id,
		name: account.name,
		type: account.type,
		archivedAt: account.archivedAt?.toISOString().slice(0, 10) ?? null,
		revision: account.revision
	}
}

function duplicateNameError() {
	return new ApplicationError('CONFLICT', 'An analytic account with this name already exists.', {
		name: ['An analytic account with this name already exists.']
	})
}

function isUniqueConstraintFailure(error: unknown) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'P2002'
	)
}

export async function listAnalyticAccounts(
	actor: Actor,
	query: AnalyticAccountListQuery
): Promise<PageResult<AnalyticAccountSummary>> {
	assertCapability(actor, 'masters:read')
	const parsed = analyticAccountListQuerySchema.parse(query)
	const prisma = getPrisma()

	const where: Prisma.AnalyticAccountWhereInput = {
		businessId: actor.businessId,
		...(parsed.includeArchived ? {} : { archivedAt: null }),
		...(parsed.type === 'ALL' ? {} : { type: parsed.type }),
		...(parsed.search === '' ? {} : { name: { contains: parsed.search, mode: 'insensitive' } })
	}

	const totalCount = await prisma.analyticAccount.count({ where })
	const { page, lastPage } = resolvePage(parsed.page, parsed.pageSize, totalCount)
	const rows = await prisma.analyticAccount.findMany({
		where,
		orderBy: [{ [parsed.sort]: parsed.direction }, { id: 'asc' }],
		skip: (page - 1) * parsed.pageSize,
		take: parsed.pageSize
	})

	return { rows: rows.map(toSummary), totalCount, page, pageSize: parsed.pageSize, lastPage }
}

export async function listSelectableAnalyticAccounts(
	actor: Actor,
	type?: AnalyticAccountSummary['type']
) {
	assertCapability(actor, 'masters:read')
	const rows = await getPrisma().analyticAccount.findMany({
		where: {
			businessId: actor.businessId,
			archivedAt: null,
			...(type == null ? {} : { type })
		},
		orderBy: [{ name: 'asc' }, { id: 'asc' }]
	})

	return rows.map(toSummary)
}

export async function getAnalyticAccountDetail(
	actor: Actor,
	analyticAccountId: string
): Promise<AnalyticAccountDetail> {
	assertCapability(actor, 'masters:read')
	const account = await getPrisma().analyticAccount.findFirst({
		where: { id: analyticAccountId, businessId: actor.businessId },
		include: { _count: { select: { journalItems: true, budgetLines: true } } }
	})

	if (!account) {
		throw new ApplicationError('NOT_FOUND', 'This analytic account does not exist.')
	}

	return {
		...toSummary(account),
		journalItemCount: account._count.journalItems,
		budgetLineCount: account._count.budgetLines
	}
}

export async function createAnalyticAccount(actor: Actor, input: AnalyticAccountInput) {
	assertCapability(actor, 'masters:create')
	const parsed = analyticAccountInputSchema.parse(input)

	try {
		return await getPrisma().analyticAccount.create({
			data: { businessId: actor.businessId, ...parsed },
			select: { id: true }
		})
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateNameError()
		throw error
	}
}

export async function updateAnalyticAccount(
	actor: Actor,
	analyticAccountId: string,
	revision: number,
	input: AnalyticAccountInput
) {
	assertCapability(actor, 'masters:update')
	const parsed = analyticAccountInputSchema.parse(input)
	const prisma = getPrisma()

	const existing = await prisma.analyticAccount.findFirst({
		where: { id: analyticAccountId, businessId: actor.businessId },
		include: { _count: { select: { journalItems: true } } }
	})

	if (!existing) {
		throw new ApplicationError('NOT_FOUND', 'This analytic account does not exist.')
	}

	if (existing.type !== parsed.type && existing._count.journalItems > 0) {
		throw new ApplicationError(
			'INVALID_STATE',
			'Posted journal items already use this analytic account, so its type cannot change.',
			{ type: ['Type is fixed once journal items reference this analytic account.'] }
		)
	}

	try {
		const result = await prisma.analyticAccount.updateMany({
			where: { id: analyticAccountId, businessId: actor.businessId, revision },
			data: { ...parsed, revision: { increment: 1 } }
		})

		if (result.count === 0) {
			throw new ApplicationError(
				'STALE_REVISION',
				'This analytic account changed while you were editing. Reload it and review the current values.'
			)
		}
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateNameError()
		throw error
	}

	return { id: analyticAccountId }
}

export async function setAnalyticAccountArchived(
	actor: Actor,
	analyticAccountId: string,
	revision: number,
	isArchived: boolean
) {
	assertCapability(actor, 'masters:archive')
	const prisma = getPrisma()

	const result = await prisma.analyticAccount.updateMany({
		where: { id: analyticAccountId, businessId: actor.businessId, revision },
		data: { archivedAt: isArchived ? new Date() : null, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		const exists = await prisma.analyticAccount.findFirst({
			where: { id: analyticAccountId, businessId: actor.businessId },
			select: { id: true }
		})

		if (!exists) {
			throw new ApplicationError('NOT_FOUND', 'This analytic account does not exist.')
		}

		throw new ApplicationError(
			'STALE_REVISION',
			'This analytic account changed while you were viewing it. Reload it and try again.'
		)
	}

	return { id: analyticAccountId }
}
