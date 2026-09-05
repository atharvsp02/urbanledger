import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import type { PaymentDetail } from '@/lib/contracts/payment'
import { formatJournalAmount } from '@/server/accounting/money'
import { ApplicationError } from '@/server/errors/application-error'

function dateOnly(value: Date) {
	return value.toISOString().slice(0, 10)
}

export async function loadPaymentDetail(
	transaction: Prisma.TransactionClient,
	businessId: string,
	paymentId: string,
	contactId?: string
): Promise<PaymentDetail> {
	const payment = await transaction.payment.findFirst({
		where: { id: paymentId, businessId, ...(contactId ? { contactId } : {}) },
		include: {
			journal: { select: { id: true, code: true, name: true } },
			journalEntry: { select: { id: true, reference: true } },
			reversalEntry: { select: { id: true, reference: true } },
			createdBy: { select: { id: true, displayName: true } },
			allocations: {
				include: {
					document: { select: { id: true, kind: true, number: true } },
					reversal: true
				},
				orderBy: [{ effectiveDate: 'asc' }, { id: 'asc' }]
			}
		}
	})
	if (!payment) throw new ApplicationError('NOT_FOUND', 'This payment does not exist.')

	return {
		id: payment.id,
		paymentNumber: payment.number,
		direction: payment.direction,
		sourceMode: payment.sourceMode,
		status: payment.status,
		paymentDate: dateOnly(payment.paymentDate),
		amount: formatJournalAmount(payment.amount),
		reference: payment.externalReference,
		revision: payment.revision,
		contact: { id: payment.contactId, name: payment.contactNameSnapshot },
		journal: payment.journal,
		journalEntry: payment.journalEntry,
		reversalEntry: payment.reversalEntry,
		reversalDate: payment.reversalDate ? dateOnly(payment.reversalDate) : null,
		reversalReason: payment.reversalReason,
		createdBy: payment.createdBy,
		createdAt: payment.createdAt.toISOString(),
		allocations: payment.allocations.map((allocation) => ({
			id: allocation.id,
			document: allocation.document,
			amount: formatJournalAmount(allocation.amount),
			effectiveDate: dateOnly(allocation.effectiveDate),
			reversal: allocation.reversal
				? {
						id: allocation.reversal.id,
						amount: formatJournalAmount(allocation.reversal.amount),
						effectiveDate: dateOnly(allocation.reversal.effectiveDate)
					}
				: null
		}))
	}
}
