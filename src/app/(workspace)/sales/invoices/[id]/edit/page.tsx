import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState, StatePanel } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getCustomerInvoice } from '@/server/sales'
import { CustomerInvoiceForm } from '@/app/(workspace)/sales/invoices/[id]/invoice-form'

export const metadata: Metadata = { title: 'Edit customer invoice' }

export default async function EditCustomerInvoicePage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	const result = await getCustomerInvoice(actor, { customerInvoiceId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const invoice = result.data
	const breadcrumbs = [
		{ label: 'Customer invoices', href: '/sales/invoices' },
		{ label: invoice.invoiceNumber, href: `/sales/invoices/${invoice.id}` },
		{ label: 'Edit' }
	]

	if (invoice.state !== 'DRAFT') {
		return (
			<>
				<PageHeader title={`Edit ${invoice.invoiceNumber}`} breadcrumbs={breadcrumbs} />
				<StatePanel
					icon={Lock}
					tone="warning"
					title="This invoice can no longer be edited"
					description="Only draft invoices are editable. Posted invoices keep the amounts they were recorded with, and cancelled invoices are closed."
				/>
			</>
		)
	}

	return (
		<>
			<PageHeader
				title={`Edit ${invoice.invoiceNumber}`}
				lead="Invoice date, due date and reference. Commercial lines stay fixed."
				breadcrumbs={breadcrumbs}
			/>
			<CustomerInvoiceForm invoice={invoice} />
		</>
	)
}
