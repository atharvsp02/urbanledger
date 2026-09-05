import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/app-shell/page-header'
import { getLedgerAccountDetail } from '@/server/masters/ledger-accounts'
import { ApplicationError } from '@/server/errors/application-error'
import { AccountForm } from '@/app/(workspace)/accounting/accounts/account-form'

export const metadata: Metadata = { title: 'Edit account' }

export default async function EditLedgerAccountPage({
	params
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	let account

	try {
		account = await getLedgerAccountDetail(id)
	} catch (error) {
		if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound()
		throw error
	}

	return (
		<>
			<PageHeader
				title={`Edit ${account.code}`}
				lead="Posted entries keep the classification they were recorded under."
				breadcrumbs={[
					{ label: 'Chart of accounts', href: '/accounting/accounts' },
					{ label: account.code, href: `/accounting/accounts/${account.id}` },
					{ label: 'Edit' }
				]}
			/>
			<AccountForm account={account} isClassificationLocked={account.journalItemCount > 0} />
		</>
	)
}
