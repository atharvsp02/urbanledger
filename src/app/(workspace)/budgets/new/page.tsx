import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getBudgetOptions } from '@/server/budgets'
import { BudgetForm } from '@/app/(workspace)/budgets/budget-form'

export const metadata: Metadata = { title: 'New budget' }

export default async function NewBudgetPage() {
	const actor = await getActor()
	const options = await getBudgetOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

	return (
		<>
			<PageHeader
				title="New budget"
				lead="Plan amounts per analytic account for a date period."
				breadcrumbs={[{ label: 'Budgets', href: '/budgets' }, { label: 'New budget' }]}
			/>
			<BudgetForm options={options.data} />
		</>
	)
}
