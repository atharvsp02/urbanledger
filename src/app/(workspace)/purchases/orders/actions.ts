'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import type { PurchaseOrderDetail } from '@/lib/contracts/purchase-order'
import type { PurchaseReceiptDetail } from '@/lib/contracts/purchase-receipt'
import { getActor } from '@/server/auth/actor'
import {
	cancelPurchaseOrder,
	confirmPurchaseOrder,
	createPurchaseOrder,
	receivePurchaseOrder,
	updateDraftPurchaseOrder
} from '@/server/purchasing'

export type PurchaseOrderActionState = ActionResult<PurchaseOrderDetail> | null
export type ReceiptActionState = ActionResult<PurchaseReceiptDetail> | null

function readLines(formData: FormData) {
	const productIds = formData.getAll('lineProductId').map(String)
	const quantities = formData.getAll('lineQuantity').map(String)
	const unitPrices = formData.getAll('lineUnitPrice').map(String)

	return productIds.map((productId, index) => ({
		productId,
		quantity: quantities[index] ?? '',
		unitPrice: unitPrices[index] ?? ''
	}))
}

export async function savePurchaseOrderAction(
	_state: PurchaseOrderActionState,
	formData: FormData
): Promise<PurchaseOrderActionState> {
	const actor = await getActor()
	const purchaseOrderId = String(formData.get('purchaseOrderId') ?? '')
	const commercial = {
		vendorId: String(formData.get('vendorId') ?? ''),
		orderDate: String(formData.get('orderDate') ?? ''),
		lines: readLines(formData)
	}

	const result =
		purchaseOrderId === ''
			? await createPurchaseOrder(actor, {
					operationKey: String(formData.get('operationKey') ?? ''),
					...commercial
				})
			: await updateDraftPurchaseOrder(actor, {
					purchaseOrderId,
					expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
					...commercial
				})

	if (result.ok) {
		revalidatePath('/purchases/orders')
		redirect(`/purchases/orders/${result.data.id}`)
	}

	return result
}

export async function confirmPurchaseOrderAction(
	purchaseOrderId: string,
	expectedRevision: number,
	operationKey: string
) {
	const actor = await getActor()
	const result = await confirmPurchaseOrder(actor, {
		operationKey,
		purchaseOrderId,
		expectedRevision
	})

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/purchases/orders')
	revalidatePath(`/purchases/orders/${purchaseOrderId}`)
}

export async function cancelPurchaseOrderAction(
	purchaseOrderId: string,
	expectedRevision: number,
	operationKey: string
) {
	const actor = await getActor()
	const result = await cancelPurchaseOrder(actor, {
		operationKey,
		purchaseOrderId,
		expectedRevision
	})

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/purchases/orders')
	revalidatePath(`/purchases/orders/${purchaseOrderId}`)
}

export async function receivePurchaseOrderAction(
	_state: ReceiptActionState,
	formData: FormData
): Promise<ReceiptActionState> {
	const actor = await getActor()
	const purchaseOrderId = String(formData.get('purchaseOrderId') ?? '')
	const result = await receivePurchaseOrder(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		purchaseOrderId,
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		receiptDate: String(formData.get('receiptDate') ?? '')
	})

	if (result.ok) {
		revalidatePath('/purchases/receipts')
		revalidatePath('/stock')
		revalidatePath(`/purchases/orders/${purchaseOrderId}`)
		redirect(`/purchases/receipts/${result.data.id}`)
	}

	return result
}
