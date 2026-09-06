'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { OpeningBalanceOptions } from '@/lib/contracts/business'
import { formatAmount } from '@/lib/format'
import { completeSetupAction } from '@/app/(workspace)/settings/actions'

const FIELD_LABELS: Record<string, string> = {
	openingDate: 'Opening date',
	openingJournalId: 'Opening journal',
	capitalAccountId: 'Capital account',
	balances: 'Opening balances'
}

export function SetupForm({
	options,
	revision,
	today
}: {
	options: OpeningBalanceOptions
	revision: number
	today: string
}) {
	const [state, formAction, isPending] = useActionState(completeSetupAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const errorOf = (field: string) => firstFieldError(state, field)

	const canSubmit =
		options.openingJournals.length > 0 &&
		options.capitalAccounts.length > 0 &&
		options.liquidityAccounts.length > 0

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="expectedRevision" value={revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'setup', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			{state?.ok === true && (
				<p role="status" className="text-sm text-success">
					Setup complete
					{state.data.openingEntry == null
						? '.'
						: ` with opening entry ${state.data.openingEntry.entryNumber} totalling ${formatAmount(state.data.openingEntry.total)}.`}
				</p>
			)}

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow className="sm:grid-cols-3">
					<Field
						id="setup-openingDate"
						label={FIELD_LABELS.openingDate}
						hint="Posting date of the opening entry."
						error={errorOf('openingDate')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="openingDate" defaultValue={today} />
						)}
					</Field>
					<Field
						id="setup-openingJournalId"
						label={FIELD_LABELS.openingJournalId}
						error={errorOf('openingJournalId')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="openingJournalId"
								defaultValue={options.openingJournals[0]?.id ?? ''}
								disabled={options.openingJournals.length === 0}
							>
								<option value="" disabled>
									Choose a journal
								</option>
								{options.openingJournals.map((journal) => (
									<option key={journal.id} value={journal.id}>
										{journal.code} {journal.name}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
					<Field
						id="setup-capitalAccountId"
						label={FIELD_LABELS.capitalAccountId}
						hint="Funds the opening balances."
						error={errorOf('capitalAccountId')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="capitalAccountId"
								defaultValue={options.capitalAccounts[0]?.id ?? ''}
								disabled={options.capitalAccounts.length === 0}
							>
								<option value="" disabled>
									Choose an account
								</option>
								{options.capitalAccounts.map((account) => (
									<option key={account.id} value={account.id}>
										{account.code} {account.name}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
				</FieldRow>

				<div className="flex flex-col gap-4">
					<p className="text-sm text-muted-foreground">
						Enter the cash and bank balances the business starts with. Leave an amount empty to skip
						that account.
					</p>
					{options.liquidityAccounts.slice(0, 2).map((account, index) => (
						<div key={account.id} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
							<input type="hidden" name="balanceAccountId" value={account.id} />
							<p className="self-end pb-3 text-sm">
								{account.code} {account.name}{' '}
								<span className="text-muted-foreground">
									({account.subtype === 'BANK' ? 'Bank' : 'Cash'})
								</span>
							</p>
							<Field
								id={`setup-balance-${index}`}
								label="Opening amount"
								error={errorOf(`balances.${index}.amount`)}
							>
								{(props) => <AmountInput {...props} name="balanceAmount" placeholder="0.00" />}
							</Field>
						</div>
					))}
					{errorOf('balances') != null && (
						<p className="text-sm text-danger">{errorOf('balances')}</p>
					)}
				</div>
			</div>

			<div>
				<button type="submit" disabled={isPending || !canSubmit} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Completing' : 'Complete setup'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Completing setup. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
