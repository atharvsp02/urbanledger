import { notFound } from 'next/navigation'
import { WorkSurface } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getPaymentOptions } from '@/server/payments'
import { getPortalCustomerInvoice } from '@/server/portal'
import { PortalDocumentView } from '@/app/portal/portal-document-view'
import { PortalPayPanel } from '@/app/portal/invoices/[id]/pay-panel'

export const dynamic = 'force-dynamic'

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getPortalCustomerInvoice(actor, { documentId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const invoice = result.data
	const isPayable = invoice.status !== 'PAID' && invoice.status !== 'REVERSED'
	const options = isPayable ? await getPaymentOptions(actor, { documentId: id }) : null
	const today = await getBusinessToday(actor)

	return (
		<PortalDocumentView
			document={invoice}
			title="Invoice from this business"
			backLabel="Portal"
			pdfHref={`/api/invoices/${invoice.id}/pdf`}
		>
			{isPayable && options?.ok === true && (
				<WorkSurface
					title="Pay this invoice"
					description="Enter any amount up to the outstanding balance."
				>
					<PortalPayPanel
						document={invoice}
						options={options.data}
						documentRevision={invoice.revision}
						today={today}
					/>
				</WorkSurface>
			)}
		</PortalDocumentView>
	)
}
