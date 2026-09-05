'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import {
	createCustomerInvoiceAction,
	deliverSalesOrderAction
} from '@/app/(workspace)/sales/orders/actions'

const DELIVERY_LABELS: Record<string, string> = { deliveryDate: 'Delivery date' }
const INVOICE_LABELS: Record<string, string> = {
	invoiceDate: 'Invoice date',
	dueDate: 'Due date',
	reference: 'Reference'
}

export function DeliveryControl({
	salesOrderId,
	revision,
	orderDate,
	hasStockLines
}: {
	salesOrderId: string
	revision: number
	orderDate: string
	hasStockLines: boolean
}) {
	const [state, formAction, isPending] = useActionState(deliverSalesOrderAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="salesOrderId" value={salesOrderId} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'delivery', DELIVERY_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<FieldRow className="sm:grid-cols-[16rem_auto] sm:items-end">
				<Field
					id="delivery-deliveryDate"
					label={DELIVERY_LABELS.deliveryDate}
					hint={
						hasStockLines
							? 'Goods and Combo lines reduce quantity on hand.'
							: 'Service lines record fulfilment without a stock movement.'
					}
					error={firstFieldError(state, 'deliveryDate')}
					isRequired
					inRow
				>
					{(props) => (
						<TextInput {...props} type="date" name="deliveryDate" defaultValue={orderDate} />
					)}
				</Field>
				<div className="sm:pb-1">
					<button type="submit" disabled={isPending} className={buttonVariants({ size: 'sm' })}>
						{isPending && (
							<Loader2
								aria-hidden="true"
								className="size-4 animate-spin motion-reduce:animate-none"
							/>
						)}
						{isPending ? 'Recording' : hasStockLines ? 'Record delivery' : 'Record fulfilment'}
					</button>
				</div>
			</FieldRow>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Recording the delivery. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}

export function InvoiceControl({
	salesOrderId,
	revision,
	orderDate
}: {
	salesOrderId: string
	revision: number
	orderDate: string
}) {
	const [state, formAction, isPending] = useActionState(createCustomerInvoiceAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="salesOrderId" value={salesOrderId} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'invoice', INVOICE_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<FieldRow className="sm:grid-cols-3">
				<Field
					id="invoice-invoiceDate"
					label={INVOICE_LABELS.invoiceDate}
					error={firstFieldError(state, 'invoiceDate')}
					isRequired
					inRow
				>
					{(props) => (
						<TextInput {...props} type="date" name="invoiceDate" defaultValue={orderDate} />
					)}
				</Field>
				<Field
					id="invoice-dueDate"
					label={INVOICE_LABELS.dueDate}
					hint="On or after the invoice date."
					error={firstFieldError(state, 'dueDate')}
					isRequired
					inRow
				>
					{(props) => <TextInput {...props} type="date" name="dueDate" defaultValue={orderDate} />}
				</Field>
				<Field
					id="invoice-reference"
					label={INVOICE_LABELS.reference}
					hint="Optional."
					error={firstFieldError(state, 'reference')}
					inRow
				>
					{(props) => <TextInput {...props} name="reference" />}
				</Field>
			</FieldRow>

			<div>
				<button type="submit" disabled={isPending} className={buttonVariants({ size: 'sm' })}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Generating' : 'Generate customer invoice'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Generating the invoice. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
