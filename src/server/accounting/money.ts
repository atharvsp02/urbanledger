import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { journalAmountSchema } from '@/lib/contracts/accounting'
import { ApplicationError } from '@/server/errors/application-error'

export type JournalDecimal = InstanceType<typeof Prisma.Decimal>

export function parseJournalAmount(value: string) {
	const parsed = journalAmountSchema.safeParse(value)

	if (!parsed.success) {
		throw new ApplicationError('VALIDATION_ERROR', parsed.error.issues[0].message)
	}

	return new Prisma.Decimal(parsed.data)
}

export function zeroJournalAmount() {
	return new Prisma.Decimal('0')
}

export function formatJournalAmount(value: JournalDecimal) {
	return value.toFixed(2)
}

export function assertJournalAmountRange(value: JournalDecimal) {
	if (!journalAmountSchema.safeParse(formatJournalAmount(value)).success) {
		throw new ApplicationError('VALIDATION_ERROR', 'The journal total exceeds the supported range.')
	}
}

export function sumJournalAmounts(values: readonly JournalDecimal[]) {
	return values.reduce((total, value) => total.plus(value), zeroJournalAmount())
}
