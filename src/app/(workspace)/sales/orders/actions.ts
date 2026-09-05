'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import type { CustomerInvoiceDetail } from '@/lib/contracts/customer-invoice'
import type { SalesDeliveryDetail } from '@/lib/contracts/sales-delivery'
import type { SalesOrderDetail } from '@/lib/contracts/sales-order'
import { getActor } from '@/server/auth/actor'
import {
	cancelSalesOrder,
	confirmSalesOrder,
	createCustomerInvoiceFromSalesOrder,
	createSalesOrder,
	deliverSalesOrder,
	updateDraftSalesOrder
} from '@/server/sales'

export type SalesOrderActionState = ActionResult<SalesOrderDetail> | null
export type DeliveryActionState = ActionResult<SalesDeliveryDetail> | null
export type InvoiceCreationState = ActionResult<CustomerInvoiceDetail> | null

function readLines(formData: FormData) {
	const productIds = formData.getAll('lineProductId').map(String)
	const quantities = formData.getAll('lineQuantity').map(String)
	const unitPrices = formData.getAll('lineUnitPrice').map(String)
	const taxIds = formData.getAll('lineTaxId').map(String)
	const analyticIds = formData.getAll('lineAnalyticAccountId').map(String)

	return productIds.map((productId, index) => ({
		productId,
		quantity: quantities[index] ?? '',
		unitPrice: unitPrices[index] ?? '',
		taxId: (taxIds[index] ?? '') === '' ? null : (taxIds[index] as string),
		analyticAccountId: (analyticIds[index] ?? '') === '' ? null : (analyticIds[index] as string)
	}))
}

export async function saveSalesOrderAction(
	_state: SalesOrderActionState,
	formData: FormData
): Promise<SalesOrderActionState> {
	const actor = await getActor()
	const salesOrderId = String(formData.get('salesOrderId') ?? '')
	const commercial = {
		customerId: String(formData.get('customerId') ?? ''),
		orderDate: String(formData.get('orderDate') ?? ''),
		lines: readLines(formData)
	}

	const result =
		salesOrderId === ''
			? await createSalesOrder(actor, {
					operationKey: String(formData.get('operationKey') ?? ''),
					...commercial
				})
			: await updateDraftSalesOrder(actor, {
					salesOrderId,
					expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
					...commercial
				})

	if (result.ok) {
		revalidatePath('/sales/orders')
		redirect(`/sales/orders/${result.data.id}`)
	}

	return result
}

export async function confirmSalesOrderAction(
	salesOrderId: string,
	expectedRevision: number,
	operationKey: string
) {
	const actor = await getActor()
	const result = await confirmSalesOrder(actor, { operationKey, salesOrderId, expectedRevision })

	if (!result.ok) throw new Error(result.error.message)

	revalidatePath('/sales/orders')
	revalidatePath(`/sales/orders/${salesOrderId}`)
}

export async function cancelSalesOrderAction(
	salesOrderId: string,
	expectedRevision: number,
	operationKey: string
) {
	const actor = await getActor()
	const result = await cancelSalesOrder(actor, { operationKey, salesOrderId, expectedRevision })

	if (!result.ok) throw new Error(result.error.message)

	revalidatePath('/sales/orders')
	revalidatePath(`/sales/orders/${salesOrderId}`)
}

export async function deliverSalesOrderAction(
	_state: DeliveryActionState,
	formData: FormData
): Promise<DeliveryActionState> {
	const actor = await getActor()
	const salesOrderId = String(formData.get('salesOrderId') ?? '')
	const result = await deliverSalesOrder(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		salesOrderId,
		expectedRevision: Number(formData.get('expectedRevision') ?? '0'),
		deliveryDate: String(formData.get('deliveryDate') ?? '')
	})

	if (result.ok) {
		revalidatePath('/sales/deliveries')
		revalidatePath('/stock')
		revalidatePath('/stock/movements')
		revalidatePath(`/sales/orders/${salesOrderId}`)
		redirect(`/sales/deliveries/${result.data.id}`)
	}

	return result
}

export async function createCustomerInvoiceAction(
	_state: InvoiceCreationState,
	formData: FormData
): Promise<InvoiceCreationState> {
	const actor = await getActor()
	const salesOrderId = String(formData.get('salesOrderId') ?? '')
	const reference = String(formData.get('reference') ?? '').trim()
	const result = await createCustomerInvoiceFromSalesOrder(actor, {
		operationKey: String(formData.get('operationKey') ?? ''),
		salesOrderId,
		expectedSalesOrderRevision: Number(formData.get('expectedRevision') ?? '0'),
		invoiceDate: String(formData.get('invoiceDate') ?? ''),
		dueDate: String(formData.get('dueDate') ?? ''),
		reference: reference === '' ? null : reference
	})

	if (result.ok) {
		revalidatePath('/sales/invoices')
		revalidatePath(`/sales/orders/${salesOrderId}`)
		redirect(`/sales/invoices/${result.data.id}`)
	}

	return result
}
