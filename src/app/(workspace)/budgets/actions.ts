'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { BudgetMutationResult } from '@/lib/contracts/budget'
import type { ActionResult } from '@/lib/contracts/errors'
import { getActor } from '@/server/auth/actor'
import { archiveBudget, createBudget, restoreBudget, updateBudget } from '@/server/budgets'

export type BudgetActionState = ActionResult<BudgetMutationResult> | null

function readLines(formData: FormData) {
	const analyticIds = formData.getAll('lineAnalyticAccountId').map(String)
	const amounts = formData.getAll('linePlannedAmount').map(String)

	return analyticIds.map((analyticAccountId, index) => ({
		analyticAccountId,
		plannedAmount: amounts[index] ?? ''
	}))
}

export async function saveBudgetAction(
	_state: BudgetActionState,
	formData: FormData
): Promise<BudgetActionState> {
	const actor = await getActor()
	const budgetId = String(formData.get('budgetId') ?? '')
	const fields = {
		operationKey: String(formData.get('operationKey') ?? ''),
		name: String(formData.get('name') ?? ''),
		startsOn: String(formData.get('startsOn') ?? ''),
		endsOn: String(formData.get('endsOn') ?? ''),
		responsibleUserId: String(formData.get('responsibleUserId') ?? ''),
		lines: readLines(formData)
	}

	const result =
		budgetId === ''
			? await createBudget(actor, fields)
			: await updateBudget(actor, {
					...fields,
					budgetId,
					expectedRevision: Number(formData.get('expectedRevision') ?? '0')
				})

	if (result.ok) {
		revalidatePath('/budgets')
		redirect(`/budgets/${result.data.budgetId}`)
	}

	return result
}

export async function setBudgetArchivedAction(
	budgetId: string,
	expectedRevision: number,
	operationKey: string,
	isArchived: boolean
) {
	const actor = await getActor()
	const input = { operationKey, budgetId, expectedRevision }
	const result = isArchived ? await archiveBudget(actor, input) : await restoreBudget(actor, input)

	if (!result.ok) throw new Error(result.error.message)

	revalidatePath('/budgets')
	revalidatePath(`/budgets/${budgetId}`)
}
