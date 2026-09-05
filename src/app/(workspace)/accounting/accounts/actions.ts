'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	ledgerAccountInputSchema,
	type AccountSubtype,
	type AccountType
} from '@/lib/masters/ledger-account'
import {
	createLedgerAccount,
	setLedgerAccountArchived,
	updateLedgerAccount
} from '@/server/masters/ledger-accounts'
import { toActionResult } from '@/server/actions/result'

export type AccountActionState = ActionResult<{ id: string }> | null

export async function saveLedgerAccountAction(
	_state: AccountActionState,
	formData: FormData
): Promise<AccountActionState> {
	const accountId = String(formData.get('accountId') ?? '')
	const revision = Number(formData.get('revision') ?? '0')
	const read = (key: string) => String(formData.get(key) ?? '')

	const result = await toActionResult(async () => {
		const input = ledgerAccountInputSchema.parse({
			code: read('code'),
			name: read('name'),
			type: read('type') as AccountType,
			subtype: read('subtype') as AccountSubtype
		})

		return accountId === ''
			? createLedgerAccount(input)
			: updateLedgerAccount(accountId, revision, input)
	})

	if (result.ok) {
		revalidatePath('/accounting/accounts')
		redirect(`/accounting/accounts/${result.data.id}`)
	}

	return result
}

export async function setLedgerAccountArchivedAction(
	accountId: string,
	revision: number,
	isArchived: boolean
) {
	const result = await toActionResult(() =>
		setLedgerAccountArchived(accountId, revision, isArchived)
	)

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/accounting/accounts')
	revalidatePath(`/accounting/accounts/${accountId}`)
}
