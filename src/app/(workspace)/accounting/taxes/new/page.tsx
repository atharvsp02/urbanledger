import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { listSelectableAccounts } from '@/server/masters/ledger-accounts'
import { TaxForm } from '@/app/(workspace)/accounting/taxes/tax-form'

export const metadata: Metadata = { title: 'New tax' }

export default async function NewTaxPage() {
	const accounts = await listSelectableAccounts()

	return (
		<>
			<PageHeader
				title="New tax"
				lead="Choose the scope first; the account mappings it needs follow."
				breadcrumbs={[{ label: 'Taxes', href: '/accounting/taxes' }, { label: 'New tax' }]}
			/>
			<TaxForm accounts={accounts} />
		</>
	)
}
