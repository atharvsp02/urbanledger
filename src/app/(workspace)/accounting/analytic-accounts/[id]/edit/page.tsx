import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { getActor } from '@/server/auth/actor'
import { getAnalyticAccountDetail } from '@/server/masters/analytic-accounts'
import { ApplicationError } from '@/server/errors/application-error'
import { AnalyticAccountForm } from '@/app/(workspace)/accounting/analytic-accounts/analytic-account-form'

export const metadata: Metadata = { title: 'Edit analytic account' }

export default async function EditAnalyticAccountPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const actor = await getActor()
	let analyticAccount

	try {
		analyticAccount = await getAnalyticAccountDetail(actor, id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	return (
		<>
			<PageHeader
				title={`Edit ${analyticAccount.name}`}
				lead="Budgets and tagged journal items keep the grouping they were recorded with."
				breadcrumbs={[
					{ label: 'Analytic accounts', href: '/accounting/analytic-accounts' },
					{
						label: analyticAccount.name,
						href: `/accounting/analytic-accounts/${analyticAccount.id}`
					},
					{ label: 'Edit' }
				]}
			/>
			<AnalyticAccountForm
				analyticAccount={analyticAccount}
				isTypeLocked={analyticAccount.journalItemCount > 0}
			/>
		</>
	)
}
