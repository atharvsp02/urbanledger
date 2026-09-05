import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { AnalyticAccountForm } from '@/app/(workspace)/accounting/analytic-accounts/analytic-account-form'

export const metadata: Metadata = { title: 'New analytic account' }

export default function NewAnalyticAccountPage() {
	return (
		<>
			<PageHeader
				title="New analytic account"
				lead="Create a grouping for budgeting and tagged ledger movements."
				breadcrumbs={[
					{ label: 'Analytic accounts', href: '/accounting/analytic-accounts' },
					{ label: 'New analytic account' }
				]}
			/>
			<AnalyticAccountForm />
		</>
	)
}
