import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import {
	journalInputSchema,
	journalListQuerySchema,
	JOURNAL_REQUIREMENTS,
	type JournalDetail,
	type JournalInput,
	type JournalListQuery,
	type JournalSummary
} from '@/lib/masters/journal'
import { requireActor } from '@/server/auth/actor'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

const ACCOUNT_REF = { select: { id: true, code: true, name: true } } as const

const JOURNAL_INCLUDE = {
	defaultIncomeAccount: ACCOUNT_REF,
	defaultExpenseAccount: ACCOUNT_REF,
	defaultControlAccount: ACCOUNT_REF,
	defaultLiquidityAccount: ACCOUNT_REF
} as const

type JournalRow = Prisma.JournalModel & {
	defaultIncomeAccount: { id: string; code: string; name: string } | null
	defaultExpenseAccount: { id: string; code: string; name: string } | null
	defaultControlAccount: { id: string; code: string; name: string } | null
	defaultLiquidityAccount: { id: string; code: string; name: string } | null
}

function toSummary(journal: JournalRow): JournalSummary {
	return {
		id: journal.id,
		code: journal.code,
		name: journal.name,
		type: journal.type,
		archivedAt: journal.archivedAt?.toISOString().slice(0, 10) ?? null,
		revision: journal.revision,
		defaultIncomeAccount: journal.defaultIncomeAccount,
		defaultExpenseAccount: journal.defaultExpenseAccount,
		defaultControlAccount: journal.defaultControlAccount,
		defaultLiquidityAccount: journal.defaultLiquidityAccount
	}
}

function duplicateCodeError() {
	return new ApplicationError('CONFLICT', 'That journal code is already in use.', {
		code: ['That journal code is already in use.']
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

// Only mappings the journal type actually needs are stored, and each one must
// be an active account of the required class.
async function resolveDefaults(businessId: string, input: JournalInput) {
	const requirements = JOURNAL_REQUIREMENTS[input.type]
	const defaults: Record<string, string | null> = {
		defaultIncomeAccountId: null,
		defaultExpenseAccountId: null,
		defaultControlAccountId: null,
		defaultLiquidityAccountId: null
	}

	for (const requirement of requirements) {
		const accountId = input[requirement.field]

		if (accountId == null) continue

		const account = await getPrisma().ledgerAccount.findFirst({
			where: { id: accountId, businessId },
			select: { type: true, subtype: true, archivedAt: true }
		})

		if (!account || account.archivedAt) {
			throw new ApplicationError('VALIDATION_ERROR', 'Check the highlighted fields.', {
				[requirement.field]: ['Choose an active account.']
			})
		}

		const subtypeMatches =
			requirement.subtypes == null || requirement.subtypes.includes(account.subtype)

		if (account.type !== requirement.accountType || !subtypeMatches) {
			throw new ApplicationError('VALIDATION_ERROR', 'Check the highlighted fields.', {
				[requirement.field]: [`Choose a ${requirement.label.toLowerCase()}.`]
			})
		}

		defaults[requirement.field] = accountId
	}

	return defaults
}

export async function listJournals(query: JournalListQuery): Promise<readonly JournalSummary[]> {
	const actor = await requireActor('masters:read')
	const parsed = journalListQuerySchema.parse(query)

	const rows = await getPrisma().journal.findMany({
		where: {
			businessId: actor.businessId,
			...(parsed.includeArchived ? {} : { archivedAt: null }),
			...(parsed.type === 'ALL' ? {} : { type: parsed.type })
		},
		include: JOURNAL_INCLUDE,
		orderBy: [{ [parsed.sort]: parsed.direction }, { id: 'asc' }]
	})

	return rows.map(toSummary)
}

export async function getJournalDetail(journalId: string): Promise<JournalDetail> {
	const actor = await requireActor('masters:read')
	const journal = await getPrisma().journal.findFirst({
		where: { id: journalId, businessId: actor.businessId },
		include: { ...JOURNAL_INCLUDE, _count: { select: { entries: true } } }
	})

	if (!journal) {
		throw new ApplicationError('NOT_FOUND', 'This journal does not exist.')
	}

	return { ...toSummary(journal), entryCount: journal._count.entries }
}

export async function createJournal(input: JournalInput) {
	const actor = await requireActor('masters:create')
	const parsed = journalInputSchema.parse(input)
	const defaults = await resolveDefaults(actor.businessId, parsed)

	try {
		return await getPrisma().journal.create({
			data: {
				businessId: actor.businessId,
				code: parsed.code,
				name: parsed.name,
				type: parsed.type,
				...defaults
			},
			select: { id: true }
		})
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateCodeError()
		throw error
	}
}

export async function updateJournal(journalId: string, revision: number, input: JournalInput) {
	const actor = await requireActor('masters:update')
	const parsed = journalInputSchema.parse(input)
	const prisma = getPrisma()

	const existing = await prisma.journal.findFirst({
		where: { id: journalId, businessId: actor.businessId },
		include: { _count: { select: { entries: true } } }
	})

	if (!existing) {
		throw new ApplicationError('NOT_FOUND', 'This journal does not exist.')
	}

	if (existing.type !== parsed.type && existing._count.entries > 0) {
		throw new ApplicationError(
			'INVALID_STATE',
			'Posted entries already use this journal, so its type cannot change.',
			{ type: ['Journal type is fixed once entries reference it.'] }
		)
	}

	const defaults = await resolveDefaults(actor.businessId, parsed)

	try {
		const result = await prisma.journal.updateMany({
			where: { id: journalId, businessId: actor.businessId, revision },
			data: {
				code: parsed.code,
				name: parsed.name,
				type: parsed.type,
				...defaults,
				revision: { increment: 1 }
			}
		})

		if (result.count === 0) {
			throw new ApplicationError(
				'STALE_REVISION',
				'This journal changed while you were editing. Reload it and review the current values.'
			)
		}
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateCodeError()
		throw error
	}

	return { id: journalId }
}

export async function setJournalArchived(journalId: string, revision: number, isArchived: boolean) {
	const actor = await requireActor('masters:archive')
	const prisma = getPrisma()

	const result = await prisma.journal.updateMany({
		where: { id: journalId, businessId: actor.businessId, revision },
		data: { archivedAt: isArchived ? new Date() : null, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		const exists = await prisma.journal.findFirst({
			where: { id: journalId, businessId: actor.businessId },
			select: { id: true }
		})

		if (!exists) {
			throw new ApplicationError('NOT_FOUND', 'This journal does not exist.')
		}

		throw new ApplicationError(
			'STALE_REVISION',
			'This journal changed while you were viewing it. Reload it and try again.'
		)
	}

	return { id: journalId }
}
