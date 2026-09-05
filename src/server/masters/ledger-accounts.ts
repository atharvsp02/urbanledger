import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import {
	isSubtypeCompatible,
	ledgerAccountInputSchema,
	ledgerAccountListQuerySchema,
	type LedgerAccountDetail,
	type LedgerAccountInput,
	type LedgerAccountListQuery,
	type LedgerAccountSummary
} from '@/lib/masters/ledger-account'
import { requireActor } from '@/server/auth/actor'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { recordMasterAudit } from '@/server/masters/audit'
import { resolvePage, type PageResult } from '@/server/masters/pagination'

type LedgerAccountRow = Prisma.LedgerAccountModel

function toSummary(account: LedgerAccountRow): LedgerAccountSummary {
	return {
		id: account.id,
		code: account.code,
		name: account.name,
		type: account.type,
		subtype: account.subtype,
		archivedAt: account.archivedAt?.toISOString().slice(0, 10) ?? null,
		revision: account.revision
	}
}

function duplicateCodeError() {
	return new ApplicationError('CONFLICT', 'That account code is already in use.', {
		code: ['That account code is already in use.']
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

export async function listLedgerAccounts(
	query: LedgerAccountListQuery
): Promise<PageResult<LedgerAccountSummary>> {
	const actor = await requireActor('masters:read')
	const parsed = ledgerAccountListQuerySchema.parse(query)
	const prisma = getPrisma()

	const where: Prisma.LedgerAccountWhereInput = {
		businessId: actor.businessId,
		...(parsed.includeArchived ? {} : { archivedAt: null }),
		...(parsed.type === 'ALL' ? {} : { type: parsed.type }),
		...(parsed.search === ''
			? {}
			: {
					OR: [
						{ code: { contains: parsed.search, mode: 'insensitive' } },
						{ name: { contains: parsed.search, mode: 'insensitive' } }
					]
				})
	}

	const totalCount = await prisma.ledgerAccount.count({ where })
	const { page, lastPage } = resolvePage(parsed.page, parsed.pageSize, totalCount)
	const rows = await prisma.ledgerAccount.findMany({
		where,
		orderBy: [{ [parsed.sort]: parsed.direction }, { id: 'asc' }],
		skip: (page - 1) * parsed.pageSize,
		take: parsed.pageSize
	})

	return { rows: rows.map(toSummary), totalCount, page, pageSize: parsed.pageSize, lastPage }
}

// Selectors offer active accounts only; archived accounts stay readable through
// the documents and journals that already reference them.
export async function listSelectableAccounts(filter?: {
	type?: LedgerAccountSummary['type']
	subtypes?: readonly LedgerAccountSummary['subtype'][] | null
}) {
	const actor = await requireActor('masters:read')
	const rows = await getPrisma().ledgerAccount.findMany({
		where: {
			businessId: actor.businessId,
			archivedAt: null,
			...(filter?.type == null ? {} : { type: filter.type }),
			...(filter?.subtypes == null ? {} : { subtype: { in: [...filter.subtypes] } })
		},
		orderBy: [{ code: 'asc' }]
	})

	return rows.map(toSummary)
}

export async function getLedgerAccountDetail(accountId: string): Promise<LedgerAccountDetail> {
	const actor = await requireActor('masters:read')
	const prisma = getPrisma()
	const account = await prisma.ledgerAccount.findFirst({
		where: { id: accountId, businessId: actor.businessId },
		include: {
			_count: { select: { journalItems: true } },
			incomeJournalDefaults: { select: { id: true, code: true, name: true } },
			expenseJournalDefaults: { select: { id: true, code: true, name: true } },
			controlJournalDefaults: { select: { id: true, code: true, name: true } },
			liquidityJournalDefaults: { select: { id: true, code: true, name: true } },
			taxInputs: { select: { id: true, name: true } },
			taxOutputs: { select: { id: true, name: true } }
		}
	})

	if (!account) {
		throw new ApplicationError('NOT_FOUND', 'This account does not exist.')
	}

	const journalDefaults = new Map(
		[
			...account.incomeJournalDefaults,
			...account.expenseJournalDefaults,
			...account.controlJournalDefaults,
			...account.liquidityJournalDefaults
		].map((journal) => [journal.id, journal])
	)
	const taxDefaults = new Map(
		[...account.taxInputs, ...account.taxOutputs].map((tax) => [tax.id, tax])
	)

	return {
		...toSummary(account),
		journalItemCount: account._count.journalItems,
		defaultOfJournals: [...journalDefaults.values()],
		defaultOfTaxes: [...taxDefaults.values()]
	}
}

export async function createLedgerAccount(input: LedgerAccountInput) {
	const actor = await requireActor('masters:create')
	const parsed = ledgerAccountInputSchema.parse(input)

	try {
		const account = await getPrisma().ledgerAccount.create({
			data: { ...parsed, businessId: actor.businessId },
			select: { id: true }
		})
		await recordMasterAudit(actor, 'ledger_account.created', 'LedgerAccount', account.id)
		return account
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateCodeError()
		throw error
	}
}

export async function updateLedgerAccount(
	accountId: string,
	revision: number,
	input: LedgerAccountInput
) {
	const actor = await requireActor('masters:update')
	const parsed = ledgerAccountInputSchema.parse(input)
	const prisma = getPrisma()

	const existing = await prisma.ledgerAccount.findFirst({
		where: { id: accountId, businessId: actor.businessId },
		include: { _count: { select: { journalItems: true } } }
	})

	if (!existing) {
		throw new ApplicationError('NOT_FOUND', 'This account does not exist.')
	}

	const isReclassification = existing.type !== parsed.type || existing.subtype !== parsed.subtype

	if (isReclassification && existing._count.journalItems > 0) {
		throw new ApplicationError(
			'INVALID_STATE',
			'Posted entries already use this account, so its classification cannot change.',
			{ type: ['Classification is fixed once journal items use this account.'] }
		)
	}

	if (!isSubtypeCompatible(parsed.type, parsed.subtype)) {
		throw new ApplicationError('VALIDATION_ERROR', 'Check the highlighted fields.', {
			subtype: ['This subtype is not available for the chosen classification.']
		})
	}

	try {
		const result = await prisma.ledgerAccount.updateMany({
			where: { id: accountId, businessId: actor.businessId, revision },
			data: { ...parsed, revision: { increment: 1 } }
		})

		if (result.count === 0) {
			throw new ApplicationError(
				'STALE_REVISION',
				'This account changed while you were editing. Reload it and review the current values.'
			)
		}
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateCodeError()
		throw error
	}

	await recordMasterAudit(actor, 'ledger_account.updated', 'LedgerAccount', accountId)
	return { id: accountId }
}

export async function setLedgerAccountArchived(
	accountId: string,
	revision: number,
	isArchived: boolean
) {
	const actor = await requireActor('masters:archive')
	const prisma = getPrisma()

	const existing = await prisma.ledgerAccount.findFirst({
		where: { id: accountId, businessId: actor.businessId },
		include: {
			_count: {
				select: {
					incomeJournalDefaults: true,
					expenseJournalDefaults: true,
					controlJournalDefaults: true,
					liquidityJournalDefaults: true,
					taxInputs: true,
					taxOutputs: true
				}
			}
		}
	})

	if (!existing) {
		throw new ApplicationError('NOT_FOUND', 'This account does not exist.')
	}

	const defaultReferences =
		existing._count.incomeJournalDefaults +
		existing._count.expenseJournalDefaults +
		existing._count.controlJournalDefaults +
		existing._count.liquidityJournalDefaults +
		existing._count.taxInputs +
		existing._count.taxOutputs

	if (isArchived && defaultReferences > 0) {
		throw new ApplicationError(
			'INVALID_STATE',
			'This account is a journal or tax default. Replace it there before archiving.'
		)
	}

	const result = await prisma.ledgerAccount.updateMany({
		where: { id: accountId, businessId: actor.businessId, revision },
		data: { archivedAt: isArchived ? new Date() : null, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		throw new ApplicationError(
			'STALE_REVISION',
			'This account changed while you were viewing it. Reload it and try again.'
		)
	}

	await recordMasterAudit(
		actor,
		isArchived ? 'ledger_account.archived' : 'ledger_account.restored',
		'LedgerAccount',
		accountId
	)
	return { id: accountId }
}
