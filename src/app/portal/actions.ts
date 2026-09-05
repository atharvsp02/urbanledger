'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/contracts/errors'
import type { PaymentAttemptDetail } from '@/lib/contracts/payment'
import type { PortalPaymentDetail } from '@/lib/contracts/portal'
import { getActor } from '@/server/auth/actor'
import {
	cancelPortalPaymentAttempt,
	createPortalPaymentAttempt,
	finalizePortalPaymentAttempt,
	getPortalPaymentAttemptStatus
} from '@/server/payments'
import { getPortalPayment } from '@/server/portal'

export type PortalAttemptState = ActionResult<PaymentAttemptDetail> | null

export async function startPortalPaymentAction(input: {
	operationKey: string
	documentId: string
	expectedDocumentRevision: number
	paymentDate: string
	amount: string
}): Promise<ActionResult<PaymentAttemptDetail>> {
	const actor = await getActor()
	return createPortalPaymentAttempt(actor, input)
}

export async function finalizePortalPaymentAction(input: {
	operationKey: string
	attemptId: string
	expectedRevision: number
	journalId?: string
	outcome: 'SUCCEEDED' | 'FAILED'
	documentId: string
}): Promise<ActionResult<PaymentAttemptDetail>> {
	const actor = await getActor()
	const { documentId, ...attemptInput } = input
	const result = await finalizePortalPaymentAttempt(actor, attemptInput)

	if (result.ok) {
		revalidatePath('/portal')
		revalidatePath(`/portal/invoices/${documentId}`)
	}

	return result
}

export async function cancelPortalPaymentAction(input: {
	operationKey: string
	attemptId: string
	expectedRevision: number
}): Promise<ActionResult<PaymentAttemptDetail>> {
	const actor = await getActor()
	return cancelPortalPaymentAttempt(actor, input)
}

export async function readPortalAttemptStatusAction(
	attemptId: string
): Promise<ActionResult<PaymentAttemptDetail>> {
	const actor = await getActor()
	return getPortalPaymentAttemptStatus(actor, { attemptId })
}

export async function readPortalPaymentAction(
	paymentId: string
): Promise<ActionResult<PortalPaymentDetail>> {
	const actor = await getActor()
	return getPortalPayment(actor, { paymentId })
}
