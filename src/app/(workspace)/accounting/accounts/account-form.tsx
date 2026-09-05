'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import {
	accountSubtypes,
	accountTypes,
	ACCOUNT_SUBTYPE_LABELS,
	ACCOUNT_TYPE_LABELS,
	isSubtypeCompatible,
	requiredTypeForSubtype,
	type AccountType,
	type LedgerAccountDetail
} from '@/lib/masters/ledger-account'
import { saveLedgerAccountAction } from '@/app/(workspace)/accounting/accounts/actions'

const FIELD_LABELS: Record<string, string> = {
	code: 'Account code',
	name: 'Account name',
	type: 'Classification',
	subtype: 'Subtype'
}

export function AccountForm({
	account,
	isClassificationLocked = false
}: {
	account?: LedgerAccountDetail
	isClassificationLocked?: boolean
}) {
	const [state, formAction, isPending] = useActionState(saveLedgerAccountAction, null)
	const [type, setType] = useState<AccountType>(account?.type ?? 'ASSET')
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{account != null && (
				<>
					<input type="hidden" name="accountId" value={account.id} />
					<input type="hidden" name="revision" value={account.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'account', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow>
					<Field
						id="account-code"
						label={FIELD_LABELS.code}
						hint="Unique within the business."
						error={errorOf('code')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="code" defaultValue={account?.code} />}
					</Field>
					<Field
						id="account-name"
						label={FIELD_LABELS.name}
						error={errorOf('name')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="name" defaultValue={account?.name} />}
					</Field>
				</FieldRow>

				<FieldRow>
					<Field
						id="account-type"
						label={FIELD_LABELS.type}
						hint={
							isClassificationLocked
								? 'Fixed because posted journal items use this account.'
								: 'Determines how the account appears in reports.'
						}
						error={errorOf('type')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="type"
								value={type}
								onChange={(event) => setType(event.target.value as AccountType)}
								disabled={isClassificationLocked}
							>
								{accountTypes.map((value) => (
									<option key={value} value={value}>
										{ACCOUNT_TYPE_LABELS[value]}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
					<Field
						id="account-subtype"
						label={FIELD_LABELS.subtype}
						hint="Control and liquidity roles are restricted to their classification."
						error={errorOf('subtype')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="subtype"
								defaultValue={account?.subtype ?? 'GENERAL'}
								disabled={isClassificationLocked}
							>
								{accountSubtypes
									.filter((value) => isSubtypeCompatible(type, value))
									.map((value) => (
										<option key={value} value={value}>
											{ACCOUNT_SUBTYPE_LABELS[value]}
										</option>
									))}
							</SelectInput>
						)}
					</Field>
				</FieldRow>

				{isClassificationLocked && (
					<>
						<input type="hidden" name="type" value={account?.type} />
						<input type="hidden" name="subtype" value={account?.subtype} />
					</>
				)}

				<p className="text-sm text-muted-foreground">
					{accountSubtypes
						.filter((value) => requiredTypeForSubtype(value) !== null)
						.map(
							(value) =>
								`${ACCOUNT_SUBTYPE_LABELS[value]} requires ${ACCOUNT_TYPE_LABELS[requiredTypeForSubtype(value) as AccountType]}`
						)
						.join('. ')}
					. General works with every classification.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : account == null ? 'Create account' : 'Save changes'}
				</button>
				<Link
					href={account == null ? '/accounting/accounts' : `/accounting/accounts/${account.id}`}
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
