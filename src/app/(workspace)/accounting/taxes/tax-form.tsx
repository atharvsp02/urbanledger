'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { LedgerAccountSummary } from '@/lib/masters/ledger-account'
import {
	taxScopes,
	TAX_REQUIREMENTS,
	TAX_SCOPE_HINTS,
	TAX_SCOPE_LABELS,
	type TaxScope,
	type TaxSummary
} from '@/lib/masters/tax'
import { saveTaxAction } from '@/app/(workspace)/accounting/taxes/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Tax name',
	rate: 'Rate',
	scope: 'Scope',
	inputAccountId: 'Input tax account',
	outputAccountId: 'Output tax account'
}

export function TaxForm({
	tax,
	accounts
}: {
	tax?: TaxSummary
	accounts: readonly LedgerAccountSummary[]
}) {
	const [state, formAction, isPending] = useActionState(saveTaxAction, null)
	const [scope, setScope] = useState<TaxScope>(tax?.scope ?? 'SALES')
	const errorOf = (field: string) => firstFieldError(state, field)
	const requirements = TAX_REQUIREMENTS[scope]

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{tax != null && (
				<>
					<input type="hidden" name="taxId" value={tax.id} />
					<input type="hidden" name="revision" value={tax.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'tax', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow>
					<Field
						id="tax-name"
						label={FIELD_LABELS.name}
						hint="Unique within the business."
						error={errorOf('name')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="name" defaultValue={tax?.name} />}
					</Field>
					<Field
						id="tax-rate"
						label={FIELD_LABELS.rate}
						hint="A percentage from 0 to 100, with up to four decimals."
						error={errorOf('rate')}
						isRequired
						inRow
					>
						{(props) => (
							<AmountInput {...props} name="rate" placeholder="18" defaultValue={tax?.rate} />
						)}
					</Field>
				</FieldRow>

				<Field
					id="tax-scope"
					label={FIELD_LABELS.scope}
					hint={TAX_SCOPE_HINTS[scope]}
					error={errorOf('scope')}
					isRequired
				>
					{(props) => (
						<SelectInput
							{...props}
							name="scope"
							value={scope}
							onChange={(event) => setScope(event.target.value as TaxScope)}
						>
							{taxScopes.map((value) => (
								<option key={value} value={value}>
									{TAX_SCOPE_LABELS[value]}
								</option>
							))}
						</SelectInput>
					)}
				</Field>

				{requirements.map((requirement) => {
					const options = accounts.filter(
						(account) =>
							account.type === requirement.accountType && account.subtype === requirement.subtype
					)
					const current =
						requirement.field === 'inputAccountId' ? tax?.inputAccount : tax?.outputAccount

					return (
						<Field
							key={requirement.field}
							id={`tax-${requirement.field}`}
							label={requirement.label}
							hint={
								options.length === 0
									? 'No active account of this class exists yet. Create one first.'
									: requirement.hint
							}
							error={errorOf(requirement.field)}
							isRequired
						>
							{(props) => (
								<SelectInput
									{...props}
									name={requirement.field}
									defaultValue={current?.id ?? ''}
									disabled={options.length === 0}
								>
									<option value="" disabled>
										Choose an account
									</option>
									{options.map((account) => (
										<option key={account.id} value={account.id}>
											{account.code} {account.name}
										</option>
									))}
								</SelectInput>
							)}
						</Field>
					)
				})}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : tax == null ? 'Create tax' : 'Save changes'}
				</button>
				<Link
					href={tax == null ? '/accounting/taxes' : `/accounting/taxes/${tax.id}`}
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
