import 'server-only'
import type { Actor } from '@/lib/contracts/access'
import type { Prisma } from '@/generated/prisma/client'
import {
	taxInputSchema,
	taxListQuerySchema,
	TAX_REQUIREMENTS,
	type TaxInput,
	type TaxListQuery,
	type TaxSummary
} from '@/lib/masters/tax'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { assertCapability } from '@/server/masters/authorize'
import { resolvePage, type PageResult } from '@/server/masters/pagination'

const ACCOUNT_REF = { select: { id: true, code: true, name: true } } as const
const TAX_INCLUDE = { inputAccount: ACCOUNT_REF, outputAccount: ACCOUNT_REF } as const

type TaxRow = Prisma.TaxModel & {
	inputAccount: { id: string; code: string; name: string } | null
	outputAccount: { id: string; code: string; name: string } | null
}

function toSummary(tax: TaxRow): TaxSummary {
	return {
		id: tax.id,
		name: tax.name,
		rate: tax.rate.toFixed(4),
		scope: tax.scope,
		archivedAt: tax.archivedAt?.toISOString().slice(0, 10) ?? null,
		revision: tax.revision,
		inputAccount: tax.inputAccount,
		outputAccount: tax.outputAccount
	}
}

function duplicateNameError() {
	return new ApplicationError('CONFLICT', 'A tax with this name already exists.', {
		name: ['A tax with this name already exists.']
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

// Only the mappings the scope needs are stored, so changing scope clears the
// mapping that no longer applies.
async function resolveAccounts(businessId: string, input: TaxInput) {
	const accounts: Record<string, string | null> = { inputAccountId: null, outputAccountId: null }

	for (const requirement of TAX_REQUIREMENTS[input.scope]) {
		const accountId = input[requirement.field]

		if (accountId == null) continue

		const account = await getPrisma().ledgerAccount.findFirst({
			where: { id: accountId, businessId },
			select: { type: true, subtype: true, archivedAt: true }
		})

		if (!account || account.archivedAt) {
			throw new ApplicationError('ARCHIVED_DEPENDENCY', 'Choose an active account.', {
				[requirement.field]: ['Choose an active account.']
			})
		}

		if (account.type !== requirement.accountType || account.subtype !== requirement.subtype) {
			throw new ApplicationError('VALIDATION_ERROR', 'Check the highlighted fields.', {
				[requirement.field]: [`Choose an ${requirement.label.toLowerCase()}.`]
			})
		}

		accounts[requirement.field] = accountId
	}

	return accounts
}

export async function listTaxes(
	actor: Actor,
	query: TaxListQuery
): Promise<PageResult<TaxSummary>> {
	assertCapability(actor, 'masters:read')
	const parsed = taxListQuerySchema.parse(query)
	const prisma = getPrisma()

	const where: Prisma.TaxWhereInput = {
		businessId: actor.businessId,
		...(parsed.includeArchived ? {} : { archivedAt: null }),
		...(parsed.scope === 'ALL' ? {} : { scope: parsed.scope }),
		...(parsed.search === '' ? {} : { name: { contains: parsed.search, mode: 'insensitive' } })
	}

	const totalCount = await prisma.tax.count({ where })
	const { page, lastPage } = resolvePage(parsed.page, parsed.pageSize, totalCount)
	const rows = await prisma.tax.findMany({
		where,
		include: TAX_INCLUDE,
		orderBy: [{ [parsed.sort]: parsed.direction }, { id: 'asc' }],
		skip: (page - 1) * parsed.pageSize,
		take: parsed.pageSize
	})

	return { rows: rows.map(toSummary), totalCount, page, pageSize: parsed.pageSize, lastPage }
}

export async function listSelectableTaxes(actor: Actor, scope?: 'SALES' | 'PURCHASE') {
	assertCapability(actor, 'masters:read')
	const rows = await getPrisma().tax.findMany({
		where: {
			businessId: actor.businessId,
			archivedAt: null,
			...(scope == null ? {} : { scope: { in: [scope, 'BOTH'] } })
		},
		include: TAX_INCLUDE,
		orderBy: [{ name: 'asc' }, { id: 'asc' }]
	})

	return rows.map(toSummary)
}

export async function getTax(actor: Actor, taxId: string): Promise<TaxSummary> {
	assertCapability(actor, 'masters:read')
	const tax = await getPrisma().tax.findFirst({
		where: { id: taxId, businessId: actor.businessId },
		include: TAX_INCLUDE
	})

	if (!tax) {
		throw new ApplicationError('NOT_FOUND', 'This tax does not exist.')
	}

	return toSummary(tax)
}

export async function createTax(actor: Actor, input: TaxInput) {
	assertCapability(actor, 'masters:create')
	const parsed = taxInputSchema.parse(input)
	const accounts = await resolveAccounts(actor.businessId, parsed)

	try {
		return await getPrisma().tax.create({
			data: {
				businessId: actor.businessId,
				name: parsed.name,
				rate: parsed.rate,
				scope: parsed.scope,
				...accounts
			},
			select: { id: true }
		})
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateNameError()
		throw error
	}
}

export async function updateTax(actor: Actor, taxId: string, revision: number, input: TaxInput) {
	assertCapability(actor, 'masters:update')
	const parsed = taxInputSchema.parse(input)
	const prisma = getPrisma()
	const accounts = await resolveAccounts(actor.businessId, parsed)

	try {
		const result = await prisma.tax.updateMany({
			where: { id: taxId, businessId: actor.businessId, revision },
			data: {
				name: parsed.name,
				rate: parsed.rate,
				scope: parsed.scope,
				...accounts,
				revision: { increment: 1 }
			}
		})

		if (result.count === 0) {
			await assertTaxExists(prisma, taxId, actor.businessId)
			throw new ApplicationError(
				'STALE_REVISION',
				'This tax changed while you were editing. Reload it and review the current values.'
			)
		}
	} catch (error) {
		if (isUniqueConstraintFailure(error)) throw duplicateNameError()
		throw error
	}

	return { id: taxId }
}

export async function setTaxArchived(
	actor: Actor,
	taxId: string,
	revision: number,
	isArchived: boolean
) {
	assertCapability(actor, 'masters:archive')
	const prisma = getPrisma()

	const result = await prisma.tax.updateMany({
		where: { id: taxId, businessId: actor.businessId, revision },
		data: { archivedAt: isArchived ? new Date() : null, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		await assertTaxExists(prisma, taxId, actor.businessId)
		throw new ApplicationError(
			'STALE_REVISION',
			'This tax changed while you were viewing it. Reload it and try again.'
		)
	}

	return { id: taxId }
}

async function assertTaxExists(
	prisma: ReturnType<typeof getPrisma>,
	taxId: string,
	businessId: string
) {
	const exists = await prisma.tax.findFirst({
		where: { id: taxId, businessId },
		select: { id: true }
	})

	if (!exists) {
		throw new ApplicationError('NOT_FOUND', 'This tax does not exist.')
	}
}
