import 'server-only'
import type { SequenceKind } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'

export async function allocateDocumentNumber(
	transaction: Prisma.TransactionClient,
	businessId: string,
	kind: SequenceKind,
	documentDate: string,
	prefix: string
) {
	const period = documentDate.slice(0, 4)
	const sequence = await transaction.documentSequence.upsert({
		where: { businessId_kind_period: { businessId, kind, period } },
		create: {
			businessId,
			kind,
			period,
			prefix: `${prefix}/${period}`,
			nextNumber: BigInt('2')
		},
		update: { nextNumber: { increment: 1 } }
	})

	const number = sequence.nextNumber - BigInt('1')
	return `${sequence.prefix}/${number.toString().padStart(6, '0')}`
}
