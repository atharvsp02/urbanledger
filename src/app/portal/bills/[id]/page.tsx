import { notFound } from 'next/navigation'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getPortalVendorBill } from '@/server/portal'
import { PortalDocumentView } from '@/app/portal/portal-document-view'

export const dynamic = 'force-dynamic'

export default async function PortalBillPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getPortalVendorBill(actor, { documentId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	return (
		<PortalDocumentView
			document={result.data}
			title="Bill this business owes you"
			backLabel="Portal"
		>
			<p className="rounded-xl border border-border bg-surface-soft p-3 text-sm text-muted-foreground">
				Vendor bills are read-only here. This business records outgoing payments itself.
			</p>
		</PortalDocumentView>
	)
}
