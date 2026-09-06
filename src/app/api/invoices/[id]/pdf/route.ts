import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { pdfResponse, renderDocumentPdf } from '@/server/documents/pdf'
import { getInvoicePrintData } from '@/server/portal'
import { ApplicationError } from '@/server/errors/application-error'

function failure(error: unknown) {
	const applicationError =
		error instanceof ApplicationError
			? error
			: new ApplicationError('INTERNAL_ERROR', 'The document could not be rendered.')
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
		const result = await getInvoicePrintData(actor, { documentId: id })

		if (!result.ok) {
			throw new ApplicationError(result.error.code, result.error.message)
		}

		const invoice = result.data
		const bytes = await renderDocumentPdf({
			title: 'Invoice',
			documentNumber: invoice.number,
			businessName: invoice.business.name,
			businessAddressLines: invoice.business.addressLines,
			partyLabel: 'Billed to',
			partyName: invoice.contact.name,
			facts: [
				{ label: 'Invoice date', value: formatBusinessDate(invoice.documentDate) },
				{ label: 'Due date', value: formatBusinessDate(invoice.dueDate) },
				{ label: 'Order', value: invoice.sourceOrder.number },
				{ label: 'Reference', value: invoice.reference ?? '-' }
			],
			columns: [
				{ header: 'Item', width: 34 },
				{ header: 'Qty', width: 10, align: 'right' },
				{ header: 'Unit price', width: 14, align: 'right' },
				{ header: 'Net', width: 14, align: 'right' },
				{ header: 'Tax', width: 14, align: 'right' },
				{ header: 'Total', width: 14, align: 'right' }
			],
			rows: invoice.lines.map((line) => [
				line.productName,
				formatQuantity(line.quantity),
				formatAmount(trimMoneyScale(line.unitPrice), { currencySymbol: '' }),
				formatAmount(line.netTotal, { currencySymbol: '' }),
				formatAmount(line.taxAmount, { currencySymbol: '' }),
				formatAmount(line.total, { currencySymbol: '' })
			]),
			totals: [
				{ label: 'Net', value: formatAmount(invoice.netTotal, { currencySymbol: '' }) },
				{ label: 'Tax', value: formatAmount(invoice.taxTotal, { currencySymbol: '' }) },
				{
					label: 'Total',
					value: formatAmount(invoice.total, { currencySymbol: '' }),
					emphasis: true
				},
				{ label: 'Paid', value: formatAmount(invoice.paidAmount, { currencySymbol: '' }) },
				{
					label: 'Outstanding',
					value: formatAmount(invoice.outstandingAmount, { currencySymbol: '' }),
					emphasis: true
				}
			],
			notes: [
				`Settlement status: ${invoice.status.replace('_', ' ').toLowerCase()}.`,
				`Amounts are in ${invoice.business.currency} and calculated by UrbanLedger.`
			]
		})

		return pdfResponse(bytes, `${invoice.number.replaceAll('/', '-')}.pdf`)
	} catch (error) {
		return failure(error)
	}
}
