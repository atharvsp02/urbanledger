'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import {
	createVendorBillAction,
	receivePurchaseOrderAction
} from '@/app/(workspace)/purchases/orders/actions'

const RECEIPT_LABELS: Record<string, string> = { receiptDate: 'Receipt date' }
const BILL_LABELS: Record<string, string> = {
	billDate: 'Bill date',
	dueDate: 'Due date',
	vendorReference: 'Vendor reference'
}

export function ReceiptControl({
	purchaseOrderId,
	revision,
	orderDate,
	hasGoodsLines
}: {
	purchaseOrderId: string
	revision: number
	orderDate: string
	hasGoodsLines: boolean
}) {
	const [state, formAction, isPending] = useActionState(receivePurchaseOrderAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'receipt', RECEIPT_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<FieldRow className="sm:grid-cols-[16rem_auto] sm:items-end">
				<Field
					id="receipt-receiptDate"
					label={RECEIPT_LABELS.receiptDate}
					hint={
						hasGoodsLines
							? 'Goods and Combo lines increase quantity on hand.'
							: 'Service lines record acceptance without a stock movement.'
					}
					error={firstFieldError(state, 'receiptDate')}
					isRequired
					inRow
				>
					{(props) => (
						<TextInput {...props} type="date" name="receiptDate" defaultValue={orderDate} />
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
						{isPending ? 'Recording' : hasGoodsLines ? 'Record receipt' : 'Accept services'}
					</button>
				</div>
			</FieldRow>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Recording the receipt. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}

export function VendorBillControl({
	purchaseOrderId,
	revision,
	receiptDate
}: {
	purchaseOrderId: string
	revision: number
	receiptDate: string
}) {
	const [state, formAction, isPending] = useActionState(createVendorBillAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'bill', BILL_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<FieldRow className="sm:grid-cols-3">
				<Field
					id="bill-billDate"
					label={BILL_LABELS.billDate}
					error={firstFieldError(state, 'billDate')}
					isRequired
					inRow
				>
					{(props) => (
						<TextInput {...props} type="date" name="billDate" defaultValue={receiptDate} />
					)}
				</Field>
				<Field
					id="bill-dueDate"
					label={BILL_LABELS.dueDate}
					hint="On or after the bill date."
					error={firstFieldError(state, 'dueDate')}
					isRequired
					inRow
				>
					{(props) => (
						<TextInput {...props} type="date" name="dueDate" defaultValue={receiptDate} />
					)}
				</Field>
				<Field
					id="bill-vendorReference"
					label={BILL_LABELS.vendorReference}
					hint="Optional."
					error={firstFieldError(state, 'vendorReference')}
					inRow
				>
					{(props) => <TextInput {...props} name="vendorReference" />}
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
					{isPending ? 'Generating' : 'Generate vendor bill'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Generating the vendor bill. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
