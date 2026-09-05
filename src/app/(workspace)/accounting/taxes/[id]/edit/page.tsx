import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { getActor } from '@/server/auth/actor'
import { listSelectableAccounts } from '@/server/masters/ledger-accounts'
import { getTax } from '@/server/masters/taxes'
import { ApplicationError } from '@/server/errors/application-error'
import { TaxForm } from '@/app/(workspace)/accounting/taxes/tax-form'

export const metadata: Metadata = { title: 'Edit tax' }

export default async function EditTaxPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	let tax

	try {
		tax = await getTax(actor, id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	const accounts = await listSelectableAccounts()

	return (
		<>
			<PageHeader
				title={`Edit ${tax.name}`}
				lead="Issued documents keep the rate and mappings they were calculated with."
				breadcrumbs={[
					{ label: 'Taxes', href: '/accounting/taxes' },
					{ label: tax.name, href: `/accounting/taxes/${tax.id}` },
					{ label: 'Edit' }
				]}
			/>
			<TaxForm tax={tax} accounts={accounts} />
		</>
	)
}
