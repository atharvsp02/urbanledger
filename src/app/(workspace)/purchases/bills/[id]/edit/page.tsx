import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState, StatePanel } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getVendorBill, getVendorBillOptions } from '@/server/purchasing'
import { VendorBillForm } from '@/app/(workspace)/purchases/bills/[id]/bill-form'

export const metadata: Metadata = { title: 'Edit vendor bill' }

export default async function EditVendorBillPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getVendorBill(actor, { vendorBillId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const bill = result.data
	const breadcrumbs = [
		{ label: 'Vendor bills', href: '/purchases/bills' },
		{ label: bill.billNumber, href: `/purchases/bills/${bill.id}` },
		{ label: 'Edit' }
	]

	if (bill.state !== 'DRAFT') {
		return (
			<>
				<PageHeader title={`Edit ${bill.billNumber}`} breadcrumbs={breadcrumbs} />
				<StatePanel
					icon={Lock}
					tone="warning"
					title="This bill can no longer be edited"
					description="Only draft vendor bills are editable. Posted bills keep the amounts they were recorded with, and cancelled bills are closed."
				/>
			</>
		)
	}

	const options = await getVendorBillOptions(actor)

	if (!options.ok) {
		return <ErrorState description={options.error.message} />
	}

	return (
		<>
			<PageHeader
				title={`Edit ${bill.billNumber}`}
				lead="Dates, reference, purchase tax and analytic allocation. Commercial snapshots stay fixed."
				breadcrumbs={breadcrumbs}
			/>
			<VendorBillForm bill={bill} options={options.data} />
		</>
	)
}
