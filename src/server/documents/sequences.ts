import 'server-only'
import type { SequenceKind } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'
import { ApplicationError } from '@/server/errors/application-error'

export async function allocateDocumentNumber(
	transaction: Prisma.TransactionClient,
	businessId: string,
	kind: SequenceKind,
	documentDate: string,
	_defaultPrefix: string
) {
	const period = documentDate.slice(0, 4)
	const business = await transaction.business.findUnique({ where: { id: businessId } })
	if (!business)
		throw new ApplicationError('INVALID_STATE', 'Business configuration is unavailable.')
	const prefixes: Record<Exclude<SequenceKind, 'JOURNAL_ENTRY'>, string> = {
		PURCHASE_ORDER: business.purchaseOrderPrefix,
		SALES_ORDER: business.salesOrderPrefix,
		PURCHASE_RECEIPT: business.purchaseReceiptPrefix,
		SALES_DELIVERY: business.salesDeliveryPrefix,
		CUSTOMER_INVOICE: business.customerInvoicePrefix,
		VENDOR_BILL: business.vendorBillPrefix,
		CUSTOMER_PAYMENT: business.customerPaymentPrefix,
		VENDOR_PAYMENT: business.vendorPaymentPrefix
	}
	if (kind === 'JOURNAL_ENTRY') {
		throw new ApplicationError('INVALID_STATE', 'Use the journal-entry sequence allocator.')
	}
	const prefix = `${prefixes[kind]}/${period}`
	const sequence = await transaction.documentSequence.upsert({
		where: { businessId_kind_period: { businessId, kind, period } },
		create: {
			businessId,
			kind,
			period,
			prefix,
			nextNumber: BigInt('2')
		},
		update: { prefix, nextNumber: { increment: 1 } }
	})

	const number = sequence.nextNumber - BigInt('1')
	return `${sequence.prefix}/${number.toString().padStart(6, '0')}`
}
