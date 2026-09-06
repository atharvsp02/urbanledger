'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import { saveAccountingLockDateAction } from '@/app/(workspace)/settings/actions'

const FIELD_LABELS: Record<string, string> = { lockDate: 'Accounting lock date' }

export function LockDateForm({
	revision,
	lockDate
}: {
	revision: number
	lockDate: string | null
}) {
	const [state, formAction, isPending] = useActionState(saveAccountingLockDateAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'lock', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			{state?.ok === true && (
				<p role="status" className="text-sm text-success">
					Accounting lock date updated.
				</p>
			)}

			<FieldRow className="sm:grid-cols-[16rem_auto] sm:items-end">
				<Field
					id="lock-lockDate"
					label={FIELD_LABELS.lockDate}
					hint="Posting on or before this date is blocked. Leave empty to unlock."
					error={firstFieldError(state, 'lockDate')}
					inRow
				>
					{(props) => (
						<TextInput {...props} type="date" name="lockDate" defaultValue={lockDate ?? ''} />
					)}
				</Field>
				<div className="sm:pb-1">
					<button
						type="submit"
						disabled={isPending}
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						{isPending && (
							<Loader2
								aria-hidden="true"
								className="size-4 animate-spin motion-reduce:animate-none"
							/>
						)}
						{isPending ? 'Saving' : 'Update lock date'}
					</button>
				</div>
			</FieldRow>
		</form>
	)
}
