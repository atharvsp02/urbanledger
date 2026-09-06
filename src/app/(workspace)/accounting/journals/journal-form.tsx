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
	journalTypes,
	JOURNAL_REQUIREMENTS,
	JOURNAL_TYPE_HINTS,
	JOURNAL_TYPE_LABELS,
	type JournalDetail,
	type JournalType
} from '@/lib/masters/journal'
import type { LedgerAccountSummary } from '@/lib/masters/ledger-account'
import { saveJournalAction } from '@/app/(workspace)/accounting/journals/actions'

const FIELD_LABELS: Record<string, string> = {
	code: 'Journal code',
	name: 'Journal name',
	type: 'Journal type',
	defaultIncomeAccountId: 'Income account',
	defaultExpenseAccountId: 'Expense account',
	defaultControlAccountId: 'Control account',
	defaultLiquidityAccountId: 'Liquidity account'
}

export function JournalForm({
	journal,
	accounts,
	isTypeLocked = false
}: {
	journal?: JournalDetail
	accounts: readonly LedgerAccountSummary[]
	isTypeLocked?: boolean
}) {
	const [state, formAction, isPending] = useActionState(saveJournalAction, null)
	const [type, setType] = useState<JournalType>(journal?.type ?? 'SALES')
	const errorOf = (field: string) => firstFieldError(state, field)
	const requirements = JOURNAL_REQUIREMENTS[type]

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{journal != null && (
				<>
					<input type="hidden" name="journalId" value={journal.id} />
					<input type="hidden" name="revision" value={journal.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'journal', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow>
					<Field
						id="journal-code"
						label={FIELD_LABELS.code}
						hint="Unique within the business."
						error={errorOf('code')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="code" defaultValue={journal?.code} />}
					</Field>
					<Field
						id="journal-name"
						label={FIELD_LABELS.name}
						error={errorOf('name')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="name" defaultValue={journal?.name} />}
					</Field>
				</FieldRow>

				<Field
					id="journal-type"
					label={FIELD_LABELS.type}
					hint={
						isTypeLocked
							? 'Fixed because posted entries use this journal.'
							: JOURNAL_TYPE_HINTS[type]
					}
					error={errorOf('type')}
					isRequired
				>
					{(props) => (
						<SelectInput
							{...props}
							name="type"
							value={type}
							onChange={(event) => setType(event.target.value as JournalType)}
							disabled={isTypeLocked}
						>
							{journalTypes.map((value) => (
								<option key={value} value={value}>
									{JOURNAL_TYPE_LABELS[value]}
								</option>
							))}
						</SelectInput>
					)}
				</Field>

				{isTypeLocked && <input type="hidden" name="type" value={journal?.type} />}

				{requirements.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{JOURNAL_TYPE_LABELS[type]} journals need no default account mapping.
					</p>
				) : (
					requirements.map((requirement) => {
						const options = accounts.filter(
							(account) =>
								account.type === requirement.accountType &&
								(requirement.subtypes == null || requirement.subtypes.includes(account.subtype))
						)

						return (
							<Field
								key={requirement.field}
								id={`journal-${requirement.field}`}
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
										defaultValue={
											journal?.[
												requirement.field.replace('Id', '') as
													| 'defaultIncomeAccount'
													| 'defaultExpenseAccount'
													| 'defaultControlAccount'
													| 'defaultLiquidityAccount'
											]?.id ?? ''
										}
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
					})
				)}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : journal == null ? 'Create journal' : 'Save changes'}
				</button>
				<Link
					href={journal == null ? '/accounting/journals' : `/accounting/journals/${journal.id}`}
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
