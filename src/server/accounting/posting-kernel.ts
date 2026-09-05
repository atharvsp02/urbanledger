import 'server-only'
import type { EntrySource, Prisma } from '@/generated/prisma/client'
import {
	assertJournalAmountRange,
	formatJournalAmount,
	sumJournalAmounts,
	type JournalDecimal
} from '@/server/accounting/money'
import { ApplicationError } from '@/server/errors/application-error'

export type PostedJournalLine = {
	accountId: string
	contactId: string | null
	analyticAccountId: string | null
	description: string | null
	debit: JournalDecimal
	credit: JournalDecimal
}

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

export function assertAccountingDateUnlocked(postingDate: string, accountingLockDate: Date | null) {
	if (accountingLockDate && postingDate <= dateOnly(accountingLockDate)) {
		throw new ApplicationError(
			'LOCKED_PERIOD',
			'The posting date is in a locked accounting period.'
		)
	}
}

export async function allocateJournalEntryNumber(
	transaction: Prisma.TransactionClient,
	businessId: string,
	postingDate: string
) {
	const period = postingDate.slice(0, 4)
	const business = await transaction.business.findUnique({
		where: { id: businessId },
		select: { journalEntryPrefix: true }
	})
	if (!business)
		throw new ApplicationError('INVALID_STATE', 'Business configuration is unavailable.')
	const prefix = `${business.journalEntryPrefix}/${period}`
	const sequence = await transaction.documentSequence.upsert({
		where: {
			businessId_kind_period: { businessId, kind: 'JOURNAL_ENTRY', period }
		},
		create: {
			businessId,
			kind: 'JOURNAL_ENTRY',
			period,
			prefix,
			nextNumber: BigInt('2')
		},
		update: { prefix, nextNumber: { increment: 1 } }
	})

	const number = sequence.nextNumber - BigInt('1')
	return `${sequence.prefix}/${number.toString().padStart(6, '0')}`
}

export async function commitPostedJournalEntry(
	transaction: Prisma.TransactionClient,
	input: {
		businessId: string
		journalId: string
		postingDate: Date
		reference: string
		source: EntrySource
		sourceReference: string | null
		reversalOfEntryId?: string | null
		createdById: string
		lines: PostedJournalLine[]
	}
) {
	if (input.lines.length < 2) {
		throw new ApplicationError(
			'VALIDATION_ERROR',
			'A posted journal entry requires at least two lines.'
		)
	}

	for (const line of input.lines) {
		const hasDebit = line.debit.greaterThan(0)
		const hasCredit = line.credit.greaterThan(0)

		if (hasDebit === hasCredit) {
			throw new ApplicationError(
				'VALIDATION_ERROR',
				'Each journal line requires either a positive debit or a positive credit.'
			)
		}
	}

	const totalDebit = sumJournalAmounts(input.lines.map((line) => line.debit))
	const totalCredit = sumJournalAmounts(input.lines.map((line) => line.credit))
	assertJournalAmountRange(totalDebit)
	assertJournalAmountRange(totalCredit)

	if (totalDebit.isZero() || !totalDebit.equals(totalCredit)) {
		throw new ApplicationError(
			'VALIDATION_ERROR',
			'Total debits and credits must be equal and greater than zero.'
		)
	}

	const entry = await transaction.journalEntry.create({
		data: {
			businessId: input.businessId,
			journalId: input.journalId,
			postingDate: input.postingDate,
			reference: input.reference,
			source: input.source,
			sourceReference: input.sourceReference,
			reversalOfEntryId: input.reversalOfEntryId ?? null,
			createdById: input.createdById
		},
		select: { id: true }
	})

	await transaction.journalItem.createMany({
		data: input.lines.map((line) => ({
			entryId: entry.id,
			accountId: line.accountId,
			contactId: line.contactId,
			analyticAccountId: line.analyticAccountId,
			description: line.description,
			debit: formatJournalAmount(line.debit),
			credit: formatJournalAmount(line.credit)
		}))
	})

	await transaction.journalEntry.update({
		where: { id: entry.id },
		data: { state: 'POSTED', postedAt: new Date() }
	})

	return { entryId: entry.id, totalDebit, totalCredit }
}
