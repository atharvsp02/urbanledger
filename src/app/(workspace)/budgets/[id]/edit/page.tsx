import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { ErrorState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getBudget, getBudgetOptions } from '@/server/budgets'
import { BudgetForm } from '@/app/(workspace)/budgets/budget-form'

export const metadata: Metadata = { title: 'Edit budget' }

export default async function EditBudgetPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const actor = await getActor()
	const result = await getBudget(actor, { budgetId: id })

	if (!result.ok) {
		if (result.error.code === 'NOT_FOUND') notFound()
		return <ErrorState description={result.error.message} />
	}

	const options = await getBudgetOptions(actor)

	if (!options.ok) return <ErrorState description={options.error.message} />

	return (
		<>
			<PageHeader
				title={`Edit ${result.data.name}`}
				lead="Changing the period or lines changes future report results."
				breadcrumbs={[
					{ label: 'Budgets', href: '/budgets' },
					{ label: result.data.name, href: `/budgets/${result.data.id}` },
					{ label: 'Edit' }
				]}
			/>
			<BudgetForm budget={result.data} options={options.data} />
		</>
	)
}
