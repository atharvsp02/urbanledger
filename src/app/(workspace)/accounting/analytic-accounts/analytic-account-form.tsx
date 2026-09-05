'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldGroup } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { RadioField, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import {
	analyticTypes,
	ANALYTIC_TYPE_HINTS,
	ANALYTIC_TYPE_LABELS,
	type AnalyticAccountDetail
} from '@/lib/masters/analytic-account'
import { saveAnalyticAccountAction } from '@/app/(workspace)/accounting/analytic-accounts/actions'

const FIELD_LABELS: Record<string, string> = { name: 'Name', type: 'Type' }

export function AnalyticAccountForm({
	analyticAccount,
	isTypeLocked = false
}: {
	analyticAccount?: AnalyticAccountDetail
	isTypeLocked?: boolean
}) {
	const [state, formAction, isPending] = useActionState(saveAnalyticAccountAction, null)
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{analyticAccount != null && (
				<>
					<input type="hidden" name="analyticAccountId" value={analyticAccount.id} />
					<input type="hidden" name="revision" value={analyticAccount.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'analytic', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field
					id="analytic-name"
					label={FIELD_LABELS.name}
					hint="Unique within the business."
					error={errorOf('name')}
					isRequired
				>
					{(props) => <TextInput {...props} name="name" defaultValue={analyticAccount?.name} />}
				</Field>

				<FieldGroup
					id="analytic-type"
					label={FIELD_LABELS.type}
					hint={
						isTypeLocked
							? 'Fixed because posted journal items use this analytic account.'
							: 'Determines which movements this grouping accepts.'
					}
					error={errorOf('type')}
					isRequired
				>
					{analyticTypes.map((value) => (
						<RadioField
							key={value}
							name="type"
							value={value}
							label={ANALYTIC_TYPE_LABELS[value]}
							description={ANALYTIC_TYPE_HINTS[value]}
							defaultChecked={(analyticAccount?.type ?? 'EXPENSE') === value}
							disabled={isTypeLocked}
						/>
					))}
				</FieldGroup>

				{isTypeLocked && <input type="hidden" name="type" value={analyticAccount?.type} />}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending
						? 'Saving'
						: analyticAccount == null
							? 'Create analytic account'
							: 'Save changes'}
				</button>
				<Link
					href={
						analyticAccount == null
							? '/accounting/analytic-accounts'
							: `/accounting/analytic-accounts/${analyticAccount.id}`
					}
					className={buttonVariants({ variant: 'secondary' })}
				>
					Cancel
				</Link>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Saving. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
