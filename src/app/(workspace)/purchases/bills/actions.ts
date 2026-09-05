'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import type { VendorBillDetail } from '@/lib/contracts/vendor-bill'
import { getActor } from '@/server/auth/actor'
import { cancelDraftVendorBill, postVendorBill, updateDraftVendorBill } from '@/server/purchasing'

export type VendorBillActionState = ActionResult<VendorBillDetail> | null

function readLines(formData: FormData) {
	const lineIds = formData.getAll('lineId').map(String)
	const taxIds = formData.getAll('lineTaxId').map(String)
	const analyticIds = formData.getAll('lineAnalyticAccountId').map(String)

	return lineIds.map((lineId, index) => ({
		lineId,
		taxId: (taxIds[index] ?? '') === '' ? null : (taxIds[index] as string),
		analyticAccountId: (analyticIds[index] ?? '') === '' ? null : (analyticIds[index] as string)
	}))
}

export async function saveDraftVendorBillAction(
	_state: VendorBillActionState,
	formData: FormData
): Promise<VendorBillActionState> {
	const actor = await getActor()
	const vendorBillId = String(formData.get('vendorBillId') ?? '')
	const vendorReference = String(formData.get('vendorReference') ?? '').trim()

	const result = await updateDraftVendorBill(actor, {
		vendorBillId,
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		billDate: String(formData.get('billDate') ?? ''),
		dueDate: String(formData.get('dueDate') ?? ''),
		vendorReference: vendorReference === '' ? null : vendorReference,
		lines: readLines(formData)
	})

	if (result.ok) {
		revalidatePath('/purchases/bills')
		redirect(`/purchases/bills/${vendorBillId}`)
	}

	return result
}

export async function postVendorBillAction(
	vendorBillId: string,
	expectedRevision: number,
	journalId: string,
	operationKey: string
) {
	const actor = await getActor()
	const result = await postVendorBill(actor, {
		operationKey,
		vendorBillId,
		expectedRevision,
		journalId
	})

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/purchases/bills')
	revalidatePath(`/purchases/bills/${vendorBillId}`)
	revalidatePath('/accounting/entries')
}

export async function cancelDraftVendorBillAction(
	vendorBillId: string,
	expectedRevision: number,
	operationKey: string
) {
	const actor = await getActor()
	const result = await cancelDraftVendorBill(actor, {
		operationKey,
		vendorBillId,
		expectedRevision
	})

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/purchases/bills')
	revalidatePath(`/purchases/bills/${vendorBillId}`)
}
