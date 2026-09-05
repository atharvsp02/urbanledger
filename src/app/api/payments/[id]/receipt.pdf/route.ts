import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { pdfResponse, renderDocumentPdf } from '@/server/documents/pdf'
import { getPaymentReceiptData } from '@/server/portal'
import { ApplicationError } from '@/server/errors/application-error'

function failure(error: unknown) {
	const applicationError =
		error instanceof ApplicationError
			? error
			: new ApplicationError('INTERNAL_ERROR', 'The receipt could not be rendered.')
	const status =
		applicationError.code === 'UNAUTHENTICATED'
			? 401
			: applicationError.code === 'FORBIDDEN'
				? 403
				: applicationError.code === 'NOT_FOUND'
					? 404
					: 500

	return Response.json(
		{ ok: false, error: applicationError.toActionError() },
		{ status, headers: { 'Cache-Control': 'private, no-store' } }
	)
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await context.params
		const actor = await getActor()
		const result = await getPaymentReceiptData(actor, { paymentId: id })

		if (!result.ok) {
			throw new ApplicationError(result.error.code, result.error.message)
		}

		const receipt = result.data
		const applied = receipt.allocations.reduce(
			(sum, allocation) => sum + Number(allocation.amount) - Number(allocation.reversedAmount),
			0
		)

		const bytes = await renderDocumentPdf({
			title: 'Payment receipt',
			documentNumber: receipt.number,
			businessName: receipt.business.name,
			businessAddressLines: receipt.business.addressLines,
			partyLabel: receipt.direction === 'CUSTOMER_INCOMING' ? 'Received from' : 'Paid to',
			partyName: receipt.contact.name,
			facts: [
				{ label: 'Payment date', value: formatBusinessDate(receipt.paymentDate) },
				{ label: 'Amount', value: formatAmount(receipt.amount) },
				{ label: 'Reference', value: receipt.reference ?? '-' },
				{ label: 'Status', value: receipt.status === 'POSTED' ? 'Recorded' : 'Reversed' }
			],
			columns: [
				{ header: 'Applied to', width: 40 },
				{ header: 'Effective', width: 20 },
				{ header: 'Applied', width: 20, align: 'right' },
				{ header: 'Reversed', width: 20, align: 'right' }
			],
			rows: receipt.allocations.map((allocation) => [
				allocation.document.number,
				formatBusinessDate(allocation.effectiveDate),
				formatAmount(allocation.amount),
				formatAmount(allocation.reversedAmount)
			]),
			totals: [
				{ label: 'Payment amount', value: formatAmount(receipt.amount), emphasis: true },
				{ label: 'Net applied', value: formatAmount(applied.toFixed(2)) }
			],
			notes: [
				receipt.status === 'REVERSED'
					? `This payment was reversed${receipt.reversalDate == null ? '' : ` on ${formatBusinessDate(receipt.reversalDate)}`} and no longer settles the documents below.`
					: 'This receipt confirms a payment recorded in UrbanLedger.',
				'Recorded through the UrbanLedger payment simulator. No real money was transferred.'
			]
		})

		return pdfResponse(bytes, `${receipt.number.replaceAll('/', '-')}-receipt.pdf`)
	} catch (error) {
		return failure(error)
	}
}
