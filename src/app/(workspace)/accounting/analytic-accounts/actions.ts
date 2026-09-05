'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import { analyticAccountInputSchema, type AnalyticType } from '@/lib/masters/analytic-account'
import { requireActor } from '@/server/auth/actor'
import {
	createAnalyticAccount,
	setAnalyticAccountArchived,
	updateAnalyticAccount
} from '@/server/masters/analytic-accounts'
import { toActionResult } from '@/server/actions/result'

export type AnalyticActionState = ActionResult<{ id: string }> | null

export async function saveAnalyticAccountAction(
	_state: AnalyticActionState,
	formData: FormData
): Promise<AnalyticActionState> {
	const analyticAccountId = String(formData.get('analyticAccountId') ?? '')
	const revision = Number(formData.get('revision') ?? '0')

	const result = await toActionResult(async () => {
		const actor = await requireActor(analyticAccountId === '' ? 'masters:create' : 'masters:update')
		const input = analyticAccountInputSchema.parse({
			name: String(formData.get('name') ?? ''),
			type: String(formData.get('type') ?? '') as AnalyticType
		})

		return analyticAccountId === ''
			? createAnalyticAccount(actor, input)
			: updateAnalyticAccount(actor, analyticAccountId, revision, input)
	})

	if (result.ok) {
		revalidatePath('/accounting/analytic-accounts')
		redirect(`/accounting/analytic-accounts/${result.data.id}`)
	}

	return result
}

export async function setAnalyticAccountArchivedAction(
	analyticAccountId: string,
	revision: number,
	isArchived: boolean
) {
	const result = await toActionResult(async () => {
		const actor = await requireActor('masters:archive')
		return setAnalyticAccountArchived(actor, analyticAccountId, revision, isArchived)
	})

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/accounting/analytic-accounts')
	revalidatePath(`/accounting/analytic-accounts/${analyticAccountId}`)
}
