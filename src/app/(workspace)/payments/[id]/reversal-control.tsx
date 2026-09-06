'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import { reversePaymentAction } from '@/app/(workspace)/payments/actions'

const FIELD_LABELS: Record<string, string> = {
	reversalDate: 'Reversal date',
	reason: 'Reason'
}

export function PaymentReversalControl({
	paymentId,
	revision,
	today
}: {
	paymentId: string
	revision: number
	today: string
}) {
	const [state, formAction, isPending] = useActionState(reversePaymentAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="paymentId" value={paymentId} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'reversal', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<FieldRow className="sm:grid-cols-[14rem_minmax(0,1fr)]">
				<Field
					id="reversal-reversalDate"
					label={FIELD_LABELS.reversalDate}
					error={firstFieldError(state, 'reversalDate')}
					isRequired
					inRow
				>
					{(props) => <TextInput {...props} type="date" name="reversalDate" defaultValue={today} />}
				</Field>
				<Field
					id="reversal-reason"
					label={FIELD_LABELS.reason}
					hint="Recorded with the reversing entry."
					error={firstFieldError(state, 'reason')}
					isRequired
					inRow
				>
					{(props) => <TextInput {...props} name="reason" />}
				</Field>
			</FieldRow>

			<div>
				<button
					type="submit"
					disabled={isPending}
					className={buttonVariants({ variant: 'danger', size: 'sm' })}
				>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Reversing' : 'Reverse payment'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Reversing the payment. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
