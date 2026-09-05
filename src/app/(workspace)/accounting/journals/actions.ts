'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import { journalInputSchema, type JournalType } from '@/lib/masters/journal'
import { createJournal, setJournalArchived, updateJournal } from '@/server/masters/journals'
import { toActionResult } from '@/server/actions/result'

export type JournalActionState = ActionResult<{ id: string }> | null

export async function saveJournalAction(
	_state: JournalActionState,
	formData: FormData
): Promise<JournalActionState> {
	const journalId = String(formData.get('journalId') ?? '')
	const revision = Number(formData.get('revision') ?? '0')
	const read = (key: string) => String(formData.get(key) ?? '')

	const result = await toActionResult(async () => {
		const input = journalInputSchema.parse({
			code: read('code'),
			name: read('name'),
			type: read('type') as JournalType,
			defaultIncomeAccountId: read('defaultIncomeAccountId'),
			defaultExpenseAccountId: read('defaultExpenseAccountId'),
			defaultControlAccountId: read('defaultControlAccountId'),
			defaultLiquidityAccountId: read('defaultLiquidityAccountId')
		})

		return journalId === '' ? createJournal(input) : updateJournal(journalId, revision, input)
	})

	if (result.ok) {
		revalidatePath('/accounting/journals')
		redirect(`/accounting/journals/${result.data.id}`)
	}

	return result
}

export async function setJournalArchivedAction(
	journalId: string,
	revision: number,
	isArchived: boolean
) {
	const result = await toActionResult(() => setJournalArchived(journalId, revision, isArchived))

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/accounting/journals')
	revalidatePath(`/accounting/journals/${journalId}`)
}
