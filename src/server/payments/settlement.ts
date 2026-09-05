import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { DocumentSettlement } from '@/lib/contracts/payment'
import { formatJournalAmount, sumJournalAmounts } from '@/server/accounting/money'
import { currentBusinessDate } from '@/server/business/dates'
import { ApplicationError } from '@/server/errors/application-error'

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

export async function calculateDocumentSettlement(
	transaction: Prisma.TransactionClient,
	input: {
		businessId: string
		documentId: string
		asOfDate?: string
		timezone: string
		contactId?: string
	}
): Promise<DocumentSettlement> {
	const document = await transaction.financialDocument.findFirst({
		where: {
			id: input.documentId,
			businessId: input.businessId,
			...(input.contactId ? { contactId: input.contactId } : {})
		},
		include: {
			reversalEntry: { select: { postingDate: true } },
			allocations: {
				include: {
					payment: { select: { paymentDate: true } },
					reversal: true
				}
			}
		}
	})
	if (!document) throw new ApplicationError('NOT_FOUND', 'This financial document does not exist.')
	if (document.state !== 'POSTED') {
		throw new ApplicationError(
			'INVALID_STATE',
			'Settlement is available only for posted documents.'
		)
	}

	const asOfDate = input.asOfDate ?? currentBusinessDate(input.timezone)
	const allocations = document.allocations.filter(
		(allocation) => dateOnly(allocation.effectiveDate) <= asOfDate
	)
	const allocatedAmount = sumJournalAmounts(allocations.map((allocation) => allocation.amount))
	const reversedAllocationAmount = sumJournalAmounts(
		allocations.flatMap((allocation) =>
			allocation.reversal && dateOnly(allocation.reversal.effectiveDate) <= asOfDate
				? [allocation.reversal.amount]
				: []
		)
	)
	const netPaidAmount = allocatedAmount.minus(reversedAllocationAmount)
	const paidAmount = netPaidAmount.lessThan(0) ? new Prisma.Decimal('0') : netPaidAmount
	const totalEffective =
		dateOnly(document.documentDate) <= asOfDate ? document.total : new Prisma.Decimal('0')
	const reversedAsOf =
		document.reversalEntry !== null && dateOnly(document.reversalEntry.postingDate) <= asOfDate
	const calculatedOutstanding = totalEffective.minus(paidAmount)
	const outstandingAmount = reversedAsOf
		? new Prisma.Decimal('0')
		: calculatedOutstanding.lessThan(0)
			? new Prisma.Decimal('0')
			: calculatedOutstanding
	const status = reversedAsOf
		? ('REVERSED' as const)
		: outstandingAmount.isZero() && totalEffective.greaterThan(0)
			? ('PAID' as const)
			: paidAmount.greaterThan(0)
				? ('PARTIALLY_PAID' as const)
				: ('UNPAID' as const)
	const overdueAmount =
		!reversedAsOf && dateOnly(document.dueDate) < asOfDate
			? outstandingAmount
			: new Prisma.Decimal('0')

	return {
		document: {
			id: document.id,
			kind: document.kind,
			number: document.number,
			documentDate: dateOnly(document.documentDate),
			dueDate: dateOnly(document.dueDate),
			state: reversedAsOf ? 'REVERSED' : 'POSTED',
			total: formatJournalAmount(document.total),
			contact: { id: document.contactId, name: document.contactNameSnapshot }
		},
		asOfDate,
		status,
		allocatedAmount: formatJournalAmount(allocatedAmount),
		reversedAllocationAmount: formatJournalAmount(reversedAllocationAmount),
		paidAmount: formatJournalAmount(paidAmount),
		outstandingAmount: formatJournalAmount(outstandingAmount),
		overdueAmount: formatJournalAmount(overdueAmount)
	}
}
