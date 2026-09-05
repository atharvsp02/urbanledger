'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import { taxInputSchema, type TaxScope } from '@/lib/masters/tax'
import { requireActor } from '@/server/auth/actor'
import { createTax, setTaxArchived, updateTax } from '@/server/masters/taxes'
import { toActionResult } from '@/server/actions/result'

export type TaxActionState = ActionResult<{ id: string }> | null

export async function saveTaxAction(
	_state: TaxActionState,
	formData: FormData
): Promise<TaxActionState> {
	const taxId = String(formData.get('taxId') ?? '')
	const revision = Number(formData.get('revision') ?? '0')
	const read = (key: string) => String(formData.get(key) ?? '')

	const result = await toActionResult(async () => {
		const actor = await requireActor(taxId === '' ? 'masters:create' : 'masters:update')
		const input = taxInputSchema.parse({
			name: read('name'),
			rate: read('rate'),
			scope: read('scope') as TaxScope,
			inputAccountId: read('inputAccountId'),
			outputAccountId: read('outputAccountId')
		})

		return taxId === '' ? createTax(actor, input) : updateTax(actor, taxId, revision, input)
	})

	if (result.ok) {
		revalidatePath('/accounting/taxes')
		redirect(`/accounting/taxes/${result.data.id}`)
	}

	return result
}

export async function setTaxArchivedAction(taxId: string, revision: number, isArchived: boolean) {
	const result = await toActionResult(async () => {
		const actor = await requireActor('masters:archive')
		return setTaxArchived(actor, taxId, revision, isArchived)
	})

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/accounting/taxes')
	revalidatePath(`/accounting/taxes/${taxId}`)
}
