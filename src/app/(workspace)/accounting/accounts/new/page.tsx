import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { AccountForm } from '@/app/(workspace)/accounting/accounts/account-form'

export const metadata: Metadata = { title: 'New account' }

export default function NewLedgerAccountPage() {
	return (
		<>
			<PageHeader
				title="New account"
				lead="Add a ledger account to the chart of accounts."
				breadcrumbs={[
					{ label: 'Chart of accounts', href: '/accounting/accounts' },
					{ label: 'New account' }
				]}
			/>
			<AccountForm />
		</>
	)
}
