'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { firstFieldError, fieldErrorEntries } from '@/components/ui/action-errors'
import { buttonVariants } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import type { JournalPostingOptions } from '@/lib/contracts/accounting'
import { formatAmount } from '@/lib/format'
import { postJournalAction } from '@/app/(workspace)/accounting/entries/actions'

type PostingSource = 'MANUAL' | 'OPENING'

type DraftLine = {
	id: string
	accountId: string
	contactId: string
	analyticAccountId: string
	description: string
	debit: string
	credit: string
}

const FIELD_LABELS: Record<string, string> = {
	source: 'Entry type',
	journalId: 'Journal',
	postingDate: 'Posting date',
	memo: 'Reference or memo',
	lines: 'Journal lines'
}

function emptyLine(id: string): DraftLine {
	return {
		id,
		accountId: '',
		contactId: '',
		analyticAccountId: '',
		description: '',
		debit: '',
		credit: ''
	}
}

function parseCents(value: string) {
	const normalized = value.trim() || '0'
	const match = /^(?:0|[1-9]\d{0,17})(?:\.(\d{0,2}))?$/.exec(normalized)
	if (!match) return null

	const [whole = '0'] = normalized.split('.')
	const fraction = (match[1] ?? '').padEnd(2, '0')
	return BigInt(whole) * BigInt(100) + BigInt(fraction)
}

function centsString(value: bigint) {
	const absolute = value < BigInt(0) ? -value : value
	const whole = absolute / BigInt(100)
	const fraction = (absolute % BigInt(100)).toString().padStart(2, '0')
	return `${value < BigInt(0) ? '-' : ''}${whole.toString()}.${fraction}`
}

export function JournalEntryForm({
	options,
	defaultDate,
	operationKey
}: {
	options: JournalPostingOptions
	defaultDate: string
	operationKey: string
}) {
	const [state, formAction, isPending] = useActionState(postJournalAction, null)
	const [source, setSource] = useState<PostingSource>('MANUAL')
	const [journalId, setJournalId] = useState(
		options.journals.find((journal) => journal.type === 'GENERAL')?.id ?? ''
	)
	const [lines, setLines] = useState([emptyLine('line-1'), emptyLine('line-2')])
	const nextLineId = useRef(3)
	const journals = options.journals.filter((journal) =>
		source === 'MANUAL' ? journal.type === 'GENERAL' : journal.type === 'OPENING'
	)
	const accounts = options.accounts.filter((account) =>
		source === 'MANUAL'
			? account.subtype !== 'RECEIVABLE' && account.subtype !== 'PAYABLE'
			: account.type === 'CAPITAL' || account.subtype === 'CASH' || account.subtype === 'BANK'
	)
	const accountsById = useMemo(
		() => new Map(options.accounts.map((account) => [account.id, account])),
		[options.accounts]
	)
	const totals = useMemo(() => {
		let debit = BigInt(0)
		let credit = BigInt(0)

		for (const line of lines) {
			const lineDebit = parseCents(line.debit)
			const lineCredit = parseCents(line.credit)
			if (lineDebit == null || lineCredit == null) return null
			debit += lineDebit
			credit += lineCredit
		}

		return { debit, credit, difference: debit - credit }
	}, [lines])

	function updateLine(lineId: string, patch: Partial<DraftLine>) {
		setLines((current) =>
			current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
		)
	}

	function changeSource(nextSource: PostingSource) {
		const nextType = nextSource === 'MANUAL' ? 'GENERAL' : 'OPENING'
		const nextJournal = options.journals.find((journal) => journal.type === nextType)
		setSource(nextSource)
		setJournalId(nextJournal?.id ?? '')
		setLines((current) =>
			current.map((line) => {
				const account = accountsById.get(line.accountId)
				const accountAllowed =
					nextSource === 'MANUAL'
						? account != null && account.subtype !== 'RECEIVABLE' && account.subtype !== 'PAYABLE'
						: account != null &&
							(account.type === 'CAPITAL' ||
								account.subtype === 'CASH' ||
								account.subtype === 'BANK')

				return {
					...line,
					accountId: accountAllowed ? line.accountId : '',
					contactId: nextSource === 'OPENING' ? '' : line.contactId,
					analyticAccountId: nextSource === 'OPENING' ? '' : line.analyticAccountId
				}
			})
		)
	}

	const differenceAmount = totals
		? formatAmount(centsString(totals.difference < 0 ? -totals.difference : totals.difference))
		: null
	const differenceLabel =
		totals == null
			? 'Check amounts'
			: totals.difference === BigInt(0)
				? 'Balanced'
				: totals.difference > BigInt(0)
					? 'Debit higher'
					: 'Credit higher'

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />
			<FormErrorSummary
				errors={fieldErrorEntries(state, 'journal', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<div className="grid gap-5 rounded-xl border border-border bg-surface p-5 lg:grid-cols-2">
				<Field id="journal-source" label="Entry type" isRequired>
					{(props) => (
						<SelectInput
							{...props}
							name="source"
							value={source}
							onChange={(event) => changeSource(event.target.value as PostingSource)}
						>
							<option value="MANUAL">Manual journal</option>
							<option value="OPENING">Opening journal</option>
						</SelectInput>
					)}
				</Field>
				<Field
					id="journal-journalId"
					label="Journal"
					hint="Only active journals compatible with the selected entry type are available."
					error={firstFieldError(state, 'journalId')}
					isRequired
				>
					{(props) => (
						<SelectInput
							{...props}
							name="journalId"
							value={journalId}
							onChange={(event) => setJournalId(event.target.value)}
							disabled={journals.length === 0}
						>
							<option value="" disabled>
								Choose a journal
							</option>
							{journals.map((journal) => (
								<option key={journal.id} value={journal.id}>
									{journal.code} {journal.name}
								</option>
							))}
						</SelectInput>
					)}
				</Field>
				<Field
					id="journal-postingDate"
					label="Posting date"
					error={firstFieldError(state, 'postingDate')}
					isRequired
				>
					{(props) => (
						<TextInput {...props} type="date" name="postingDate" defaultValue={defaultDate} />
					)}
				</Field>
				<Field
					id="journal-memo"
					label="Reference or memo"
					hint="Recorded in the posting audit history."
					error={firstFieldError(state, 'memo')}
					isRequired
				>
					{(props) => <TextInput {...props} name="memo" maxLength={160} />}
				</Field>
			</div>

			<div id="journal-lines" tabIndex={-1} className="rounded-xl border border-border bg-surface">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
					<div>
						<h2 className="text-[15px] font-semibold">Journal lines</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Each line must contain a debit or a credit, never both.
						</p>
					</div>
					<button
						type="button"
						disabled={lines.length >= 100}
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						onClick={() => {
							setLines((current) => [...current, emptyLine(`line-${nextLineId.current}`)])
							nextLineId.current += 1
						}}
					>
						<Plus aria-hidden="true" className="size-4" />
						Add line
					</button>
				</div>
				<div className="flex flex-col divide-y divide-border">
					{lines.map((line, index) => {
						const selectedAccount = accountsById.get(line.accountId)
						const analyticAccounts =
							selectedAccount?.type === 'INCOME' || selectedAccount?.type === 'EXPENSE'
								? options.analyticAccounts.filter(
										(account) => account.type === selectedAccount.type
									)
								: []

						return (
							<fieldset key={line.id} className="grid gap-4 p-5 xl:grid-cols-12">
								<legend className="sr-only">Journal line {index + 1}</legend>
								<label className="flex flex-col gap-1.5 text-sm font-medium xl:col-span-3">
									Account
									<SelectInput
										name="accountId"
										value={line.accountId}
										required
										onChange={(event) =>
											updateLine(line.id, {
												accountId: event.target.value,
												analyticAccountId: ''
											})
										}
									>
										<option value="" disabled>
											Choose an account
										</option>
										{accounts.map((account) => (
											<option key={account.id} value={account.id}>
												{account.code} {account.name}
											</option>
										))}
									</SelectInput>
								</label>
								<label className="flex flex-col gap-1.5 text-sm font-medium xl:col-span-3">
									Description
									<TextInput
										name="description"
										value={line.description}
										maxLength={240}
										onChange={(event) => updateLine(line.id, { description: event.target.value })}
									/>
								</label>
								<label className="flex flex-col gap-1.5 text-sm font-medium xl:col-span-2">
									Debit
									<AmountInput
										name="debit"
										value={line.debit}
										placeholder="0.00"
										onChange={(event) => updateLine(line.id, { debit: event.target.value })}
									/>
								</label>
								<label className="flex flex-col gap-1.5 text-sm font-medium xl:col-span-2">
									Credit
									<AmountInput
										name="credit"
										value={line.credit}
										placeholder="0.00"
										onChange={(event) => updateLine(line.id, { credit: event.target.value })}
									/>
								</label>
								<div className="flex items-end xl:col-span-2">
									<button
										type="button"
										disabled={lines.length <= 2}
										className={buttonVariants({ variant: 'ghost', size: 'sm' })}
										onClick={() =>
											setLines((current) => current.filter((item) => item.id !== line.id))
										}
									>
										<Trash2 aria-hidden="true" className="size-4" />
										Remove
									</button>
								</div>

								{source === 'MANUAL' ? (
									<>
										<label className="flex flex-col gap-1.5 text-sm font-medium xl:col-span-3">
											Contact
											<SelectInput
												name="contactId"
												value={line.contactId}
												onChange={(event) => updateLine(line.id, { contactId: event.target.value })}
											>
												<option value="">No contact</option>
												{options.contacts.map((contact) => (
													<option key={contact.id} value={contact.id}>
														{contact.name}
													</option>
												))}
											</SelectInput>
										</label>
										<label className="flex flex-col gap-1.5 text-sm font-medium xl:col-span-3">
											Analytic account
											<SelectInput
												name="analyticAccountId"
												value={line.analyticAccountId}
												onChange={(event) =>
													updateLine(line.id, { analyticAccountId: event.target.value })
												}
											>
												<option value="">No analytic account</option>
												{analyticAccounts.map((account) => (
													<option key={account.id} value={account.id}>
														{account.name}
													</option>
												))}
											</SelectInput>
										</label>
									</>
								) : (
									<>
										<input type="hidden" name="contactId" value="" />
										<input type="hidden" name="analyticAccountId" value="" />
									</>
								)}
							</fieldset>
						)
					})}
				</div>
			</div>

			<div className="grid gap-4 rounded-xl border border-border bg-surface-soft p-5 sm:grid-cols-3">
				<div>
					<p className="text-sm text-muted-foreground">Debit total</p>
					<p className="mt-1 text-xl font-semibold tabular-nums">
						{totals ? formatAmount(centsString(totals.debit)) : 'Check amounts'}
					</p>
				</div>
				<div>
					<p className="text-sm text-muted-foreground">Credit total</p>
					<p className="mt-1 text-xl font-semibold tabular-nums">
						{totals ? formatAmount(centsString(totals.credit)) : 'Check amounts'}
					</p>
				</div>
				<div>
					<p className="text-sm text-muted-foreground">Difference</p>
					<p className="mt-1 text-xl font-semibold tabular-nums">
						{differenceAmount ?? 'Check amounts'}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">{differenceLabel}</p>
				</div>
			</div>

			{journals.length === 0 && (
				<p className="rounded-xl border border-warning/25 bg-warning/6 p-4 text-sm">
					Create an active {source === 'MANUAL' ? 'General' : 'Opening'} journal before posting.
				</p>
			)}

			<div className="flex flex-wrap gap-3">
				<button
					type="submit"
					disabled={isPending || journals.length === 0}
					className={buttonVariants()}
				>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Posting' : 'Post journal entry'}
				</button>
				<Link href="/accounting/entries" className={buttonVariants({ variant: 'secondary' })}>
					Cancel
				</Link>
			</div>
			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Journal entry is being committed.' : ''}
			</p>
		</form>
	)
}
