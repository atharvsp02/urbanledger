'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import type { CustomerInvoiceDetail } from '@/lib/contracts/customer-invoice'
import { getActor } from '@/server/auth/actor'
import {
	cancelDraftCustomerInvoice,
	postCustomerInvoice,
	updateDraftCustomerInvoice
} from '@/server/sales'

export type CustomerInvoiceActionState = ActionResult<CustomerInvoiceDetail> | null

export async function saveDraftCustomerInvoiceAction(
	_state: CustomerInvoiceActionState,
	formData: FormData
): Promise<CustomerInvoiceActionState> {
	const actor = await getActor()
	const customerInvoiceId = String(formData.get('customerInvoiceId') ?? '')
	const reference = String(formData.get('reference') ?? '').trim()

	const result = await updateDraftCustomerInvoice(actor, {
		customerInvoiceId,
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		invoiceDate: String(formData.get('invoiceDate') ?? ''),
		dueDate: String(formData.get('dueDate') ?? ''),
		reference: reference === '' ? null : reference
	})

	if (result.ok) {
		revalidatePath('/sales/invoices')
		redirect(`/sales/invoices/${customerInvoiceId}`)
	}

	return result
}

export async function postCustomerInvoiceAction(
	customerInvoiceId: string,
	expectedRevision: number,
	journalId: string,
	operationKey: string
) {
	const actor = await getActor()
	const result = await postCustomerInvoice(actor, {
		operationKey,
		customerInvoiceId,
		expectedRevision,
		journalId
	})

	if (!result.ok) throw new Error(result.error.message)

	revalidatePath('/sales/invoices')
	revalidatePath(`/sales/invoices/${customerInvoiceId}`)
	revalidatePath('/accounting/entries')
}

export async function cancelDraftCustomerInvoiceAction(
	customerInvoiceId: string,
	expectedRevision: number,
	operationKey: string
) {
	const actor = await getActor()
	const result = await cancelDraftCustomerInvoice(actor, {
		operationKey,
		customerInvoiceId,
		expectedRevision
	})

	if (!result.ok) throw new Error(result.error.message)

	revalidatePath('/sales/invoices')
	revalidatePath(`/sales/invoices/${customerInvoiceId}`)
}
