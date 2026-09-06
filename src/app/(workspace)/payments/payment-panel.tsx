'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { PaymentOptions } from '@/lib/contracts/payment'
import { formatAmount, trimMoneyScale } from '@/lib/format'
import { recordPaymentAction } from '@/app/(workspace)/payments/actions'

const FIELD_LABELS: Record<string, string> = {
	journalId: 'Journal',
	paymentDate: 'Payment date',
	amount: 'Amount',
	reference: 'Reference'
}

export function PaymentPanel({
	options,
	direction,
	documentRevision,
	documentPath,
	today
}: {
	options: PaymentOptions
	direction: 'CUSTOMER_INCOMING' | 'VENDOR_OUTGOING'
	documentRevision: number
	documentPath: string
	today: string
}) {
	const [state, formAction, isPending] = useActionState(recordPaymentAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const errorOf = (field: string) => firstFieldError(state, field)
	const outstanding = trimMoneyScale(options.document.outstandingAmount)
	const hasJournals = options.liquidityJournals.length > 0

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="documentId" value={options.document.document.id} />
			<input type="hidden" name="expectedDocumentRevision" value={documentRevision} />
			<input type="hidden" name="direction" value={direction} />
			<input type="hidden" name="documentPath" value={documentPath} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'payment', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<FieldRow className="sm:grid-cols-2 lg:grid-cols-4">
				<Field
					id="payment-journalId"
					label={FIELD_LABELS.journalId}
					hint={
						hasJournals
							? 'Cash or bank journal the money moves through.'
							: 'Configure an active cash or bank journal first.'
					}
					error={errorOf('journalId')}
					isRequired
					inRow
				>
					{(props) => (
						<SelectInput
							{...props}
							name="journalId"
							defaultValue={options.liquidityJournals[0]?.id ?? ''}
							disabled={!hasJournals}
						>
							<option value="" disabled>
								Choose a journal
							</option>
							{options.liquidityJournals.map((journal) => (
								<option key={journal.id} value={journal.id}>
									{journal.code} {journal.name}
								</option>
							))}
						</SelectInput>
					)}
				</Field>

				<Field
					id="payment-paymentDate"
					label={FIELD_LABELS.paymentDate}
					error={errorOf('paymentDate')}
					isRequired
					inRow
				>
					{(props) => <TextInput {...props} type="date" name="paymentDate" defaultValue={today} />}
				</Field>

				<Field
					id="payment-amount"
					label={FIELD_LABELS.amount}
					hint={`Outstanding ${formatAmount(options.document.outstandingAmount)}.`}
					error={errorOf('amount')}
					isRequired
					inRow
				>
					{(props) => <AmountInput {...props} name="amount" defaultValue={outstanding} />}
				</Field>

				<Field
					id="payment-reference"
					label={FIELD_LABELS.reference}
					hint="Optional."
					error={errorOf('reference')}
					inRow
				>
					{(props) => <TextInput {...props} name="reference" />}
				</Field>
			</FieldRow>

			<div>
				<button
					type="submit"
					disabled={isPending || !hasJournals}
					className={buttonVariants({ size: 'sm' })}
				>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending
						? 'Recording'
						: direction === 'CUSTOMER_INCOMING'
							? 'Record incoming payment'
							: 'Record outgoing payment'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Recording the payment. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
