'use client'

import { useActionState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { WorkSurface } from '@/components/app-shell/page-header'
import { firstFieldError, fieldErrorEntries } from '@/components/ui/action-errors'
import { buttonVariants } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextArea, TextInput } from '@/components/ui/inputs'
import { reverseJournalAction } from '@/app/(workspace)/accounting/entries/actions'

const FIELD_LABELS: Record<string, string> = {
	postingDate: 'Reversal date',
	reason: 'Reason'
}

export function ReversalForm({
	entryId,
	minimumDate,
	defaultDate,
	operationKey
}: {
	entryId: string
	minimumDate: string
	defaultDate: string
	operationKey: string
}) {
	const [state, formAction, isPending] = useActionState(reverseJournalAction, null)

	return (
		<WorkSurface
			title="Reverse this entry"
			description="A reversal adds an opposite posting on its own effective date. The original remains unchanged."
		>
			<form action={formAction} className="flex max-w-3xl flex-col gap-5">
				<input type="hidden" name="entryId" value={entryId} />
				<input type="hidden" name="operationKey" value={operationKey} />
				<FormErrorSummary
					errors={fieldErrorEntries(state, 'reversal', FIELD_LABELS)}
					description={state?.ok === false ? state.error.message : undefined}
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field
						id="reversal-postingDate"
						label="Reversal date"
						hint={`Must be on or after ${minimumDate}.`}
						error={firstFieldError(state, 'postingDate')}
						isRequired
					>
						{(props) => (
							<TextInput
								{...props}
								type="date"
								name="postingDate"
								min={minimumDate}
								defaultValue={defaultDate < minimumDate ? minimumDate : defaultDate}
							/>
						)}
					</Field>
					<Field
						id="reversal-reason"
						label="Reason"
						hint="Explain why the correction is required."
						error={firstFieldError(state, 'reason')}
						isRequired
					>
						{(props) => <TextArea {...props} name="reason" maxLength={240} />}
					</Field>
				</div>
				<button
					type="submit"
					disabled={isPending}
					className={buttonVariants({ variant: 'danger' })}
				>
					{isPending ? (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					) : (
						<RotateCcw aria-hidden="true" className="size-4" />
					)}
					{isPending ? 'Reversing' : 'Create reversal'}
				</button>
				<p role="status" aria-live="polite" className="sr-only">
					{isPending ? 'Reversal is being committed.' : ''}
				</p>
			</form>
		</WorkSurface>
	)
}
