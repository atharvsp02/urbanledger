'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import { receivePurchaseOrderAction } from '@/app/(workspace)/purchases/orders/actions'

const RECEIPT_LABELS: Record<string, string> = { receiptDate: 'Receipt date' }
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
					hint={`Cannot be before the order date, ${orderDate}.`}
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
