'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import type { FinancialDocumentReversalResult, PaymentDetail } from '@/lib/contracts/payment'
import { getActor } from '@/server/auth/actor'
import {
	recordCustomerPayment,
	recordVendorPayment,
	reverseCustomerInvoice,
	reversePayment,
	reverseVendorBill
} from '@/server/payments'

export type PaymentActionState = ActionResult<PaymentDetail> | null
export type DocumentReversalState = ActionResult<FinancialDocumentReversalResult> | null

function readPaymentInput(formData: FormData) {
	const reference = String(formData.get('reference') ?? '').trim()

	return {
		operationKey: String(formData.get('operationKey') ?? ''),
		documentId: String(formData.get('documentId') ?? ''),
		expectedDocumentRevision: Number(formData.get('expectedDocumentRevision') ?? '0'),
		journalId: String(formData.get('journalId') ?? ''),
		paymentDate: String(formData.get('paymentDate') ?? ''),
		amount: String(formData.get('amount') ?? ''),
		reference: reference === '' ? null : reference
	}
}

export async function recordPaymentAction(
	_state: PaymentActionState,
	formData: FormData
): Promise<PaymentActionState> {
	const actor = await getActor()
	const direction = String(formData.get('direction') ?? '')
	const documentPath = String(formData.get('documentPath') ?? '')
	const input = readPaymentInput(formData)

	const result =
		direction === 'VENDOR_OUTGOING'
			? await recordVendorPayment(actor, input)
			: await recordCustomerPayment(actor, input)

	if (result.ok) {
		revalidatePath('/payments')
		if (documentPath !== '') revalidatePath(documentPath)
		redirect(`/payments/${result.data.id}`)
	}

	return result
}

export async function reversePaymentAction(
	_state: PaymentActionState,
	formData: FormData
): Promise<PaymentActionState> {
	const actor = await getActor()
	const paymentId = String(formData.get('paymentId') ?? '')
	const result = await reversePayment(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		paymentId,
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		reversalDate: String(formData.get('reversalDate') ?? ''),
		reason: String(formData.get('reason') ?? '')
	})

	if (result.ok) {
		revalidatePath('/payments')
		revalidatePath(`/payments/${paymentId}`)
	}

	return result
}

export async function reverseDocumentAction(
	_state: DocumentReversalState,
	formData: FormData
): Promise<DocumentReversalState> {
	const actor = await getActor()
	const documentKind = String(formData.get('documentKind') ?? '')
	const documentPath = String(formData.get('documentPath') ?? '')
	const input = {
		operationKey: String(formData.get('operationKey') ?? ''),
		documentId: String(formData.get('documentId') ?? ''),
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		reversalDate: String(formData.get('reversalDate') ?? ''),
		reason: String(formData.get('reason') ?? '')
	}

	const result =
		documentKind === 'VENDOR_BILL'
			? await reverseVendorBill(actor, input)
			: await reverseCustomerInvoice(actor, input)

	if (result.ok && documentPath !== '') {
		revalidatePath(documentPath)
		revalidatePath('/accounting/entries')
	}

	return result
}
