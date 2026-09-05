'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type {
	JournalPostingResult,
	ManualJournalInput,
	OpeningJournalInput,
	ReverseJournalInput
} from '@/lib/contracts/accounting'
import type { ActionResult } from '@/lib/contracts/errors'
import { postManualJournal, postOpeningJournal, reverseJournalEntry } from '@/server/accounting'
import { getActor } from '@/server/auth/actor'
import { ApplicationError } from '@/server/errors/application-error'

export type JournalActionState = ActionResult<JournalPostingResult> | null

function applicationFailure(error: unknown): ActionResult<never> {
	if (error instanceof ApplicationError) {
		return { ok: false, error: error.toActionError() }
	}

	throw error
}

function optionalValue(values: FormDataEntryValue[], index: number) {
	const value = String(values[index] ?? '').trim()
	return value || null
}

export async function postJournalAction(
	_state: JournalActionState,
	formData: FormData
): Promise<JournalActionState> {
	const accountIds = formData.getAll('accountId')
	const contactIds = formData.getAll('contactId')
	const analyticAccountIds = formData.getAll('analyticAccountId')
	const descriptions = formData.getAll('description')
	const debits = formData.getAll('debit')
	const credits = formData.getAll('credit')
	const input = {
		operationKey: String(formData.get('operationKey') ?? ''),
		journalId: String(formData.get('journalId') ?? ''),
		postingDate: String(formData.get('postingDate') ?? ''),
		memo: String(formData.get('memo') ?? ''),
		lines: accountIds.map((accountId, index) => ({
			accountId: String(accountId),
			contactId: optionalValue(contactIds, index),
			analyticAccountId: optionalValue(analyticAccountIds, index),
			description: optionalValue(descriptions, index),
			debit: String(debits[index] ?? '').trim() || '0',
			credit: String(credits[index] ?? '').trim() || '0'
		}))
	}
	const source = String(formData.get('source') ?? '')
	let result: ActionResult<JournalPostingResult>
	if (source !== 'MANUAL' && source !== 'OPENING') {
		return {
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Check the journal details.',
				fieldErrors: { source: ['Choose a manual or opening journal entry.'] }
			}
		}
	}

	try {
		const actor = await getActor()
		result =
			source === 'OPENING'
				? await postOpeningJournal(actor, input as OpeningJournalInput)
				: await postManualJournal(actor, input as ManualJournalInput)
	} catch (error) {
		result = applicationFailure(error)
	}

	if (result.ok) {
		revalidatePath('/accounting/entries')
		revalidatePath('/accounting/accounts')
		revalidatePath('/accounting/journals')
		revalidatePath('/reports/trial-balance')
		redirect(`/accounting/entries/${result.data.entryId}`)
	}

	return result
}

export async function reverseJournalAction(
	_state: JournalActionState,
	formData: FormData
): Promise<JournalActionState> {
	const input: ReverseJournalInput = {
		operationKey: String(formData.get('operationKey') ?? ''),
		entryId: String(formData.get('entryId') ?? ''),
		postingDate: String(formData.get('postingDate') ?? ''),
		reason: String(formData.get('reason') ?? '')
	}
	let result: ActionResult<JournalPostingResult>

	try {
		const actor = await getActor()
		result = await reverseJournalEntry(actor, input)
	} catch (error) {
		result = applicationFailure(error)
	}

	if (result.ok) {
		revalidatePath('/accounting/entries')
		revalidatePath(`/accounting/entries/${input.entryId}`)
		revalidatePath('/accounting/accounts')
		revalidatePath('/accounting/journals')
		revalidatePath('/reports/trial-balance')
		redirect(`/accounting/entries/${result.data.entryId}`)
	}

	return result
}
