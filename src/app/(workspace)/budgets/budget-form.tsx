'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { BudgetDetail, BudgetOptions } from '@/lib/contracts/budget'
import { formatAmount, trimMoneyScale } from '@/lib/format'
import { saveBudgetAction } from '@/app/(workspace)/budgets/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Budget name',
	startsOn: 'Starts on',
	endsOn: 'Ends on',
	responsibleUserId: 'Responsible',
	lines: 'Analytic lines'
}

type DraftLine = { key: string; analyticAccountId: string; plannedAmount: string }

function newLine(): DraftLine {
	return { key: crypto.randomUUID(), analyticAccountId: '', plannedAmount: '' }
}

export function BudgetForm({ budget, options }: { budget?: BudgetDetail; options: BudgetOptions }) {
	const [state, formAction, isPending] = useActionState(saveBudgetAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const [lines, setLines] = useState<DraftLine[]>(() =>
		budget == null
			? [newLine()]
			: budget.lines.map((line) => ({
					key: line.id,
					analyticAccountId: line.analyticAccount.id,
					plannedAmount: trimMoneyScale(line.plannedAmount)
				}))
	)

	const errorOf = (field: string) => firstFieldError(state, field)
	const plannedTotal = useMemo(
		() =>
			(
				Math.round(lines.reduce((sum, line) => sum + (Number(line.plannedAmount) || 0), 0) * 100) /
				100
			).toFixed(2),
		[lines]
	)

	function updateLine(key: string, patch: Partial<DraftLine>) {
		setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
	}

	const canSubmit = options.analyticAccounts.length > 0 && options.responsibleStaff.length > 0

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />
			{budget != null && (
				<>
					<input type="hidden" name="budgetId" value={budget.id} />
					<input type="hidden" name="expectedRevision" value={budget.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'budget', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field id="budget-name" label={FIELD_LABELS.name} error={errorOf('name')} isRequired>
					{(props) => <TextInput {...props} name="name" defaultValue={budget?.name} />}
				</Field>

				<FieldRow className="sm:grid-cols-3">
					<Field
						id="budget-startsOn"
						label={FIELD_LABELS.startsOn}
						error={errorOf('startsOn')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="startsOn" defaultValue={budget?.startsOn} />
						)}
					</Field>
					<Field
						id="budget-endsOn"
						label={FIELD_LABELS.endsOn}
						hint="On or after the start date."
						error={errorOf('endsOn')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="endsOn" defaultValue={budget?.endsOn} />
						)}
					</Field>
					<Field
						id="budget-responsibleUserId"
						label={FIELD_LABELS.responsibleUserId}
						hint={
							options.responsibleStaff.length === 0
								? 'No active staff member is available.'
								: 'Staff member accountable for this budget.'
						}
						error={errorOf('responsibleUserId')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="responsibleUserId"
								defaultValue={budget?.responsible.id ?? ''}
								disabled={options.responsibleStaff.length === 0}
							>
								<option value="" disabled>
									Choose a staff member
								</option>
								{options.responsibleStaff.map((staff) => (
									<option key={staff.id} value={staff.id}>
										{staff.displayName}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
				</FieldRow>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
					<h2 className="text-[15px] font-semibold tracking-tight">{FIELD_LABELS.lines}</h2>
					<button
						type="button"
						onClick={() => setLines((current) => [...current, newLine()])}
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						<Plus aria-hidden="true" className="size-4" />
						Add line
					</button>
				</div>

				{errorOf('lines') != null && (
					<p className="px-5 pt-4 text-sm text-danger">{errorOf('lines')}</p>
				)}

				<ul className="flex list-none flex-col p-0">
					{lines.map((line, index) => (
						<li
							key={line.key}
							className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
						>
							<Field
								id={`budget-lines-${index}-analyticAccountId`}
								label="Analytic account"
								error={errorOf(`lines.${index}.analyticAccountId`)}
								isRequired
							>
								{(props) => (
									<SelectInput
										{...props}
										name="lineAnalyticAccountId"
										value={line.analyticAccountId}
										onChange={(event) =>
											updateLine(line.key, { analyticAccountId: event.target.value })
										}
									>
										<option value="" disabled>
											Choose an analytic account
										</option>
										{options.analyticAccounts.map((account) => (
											<option key={account.id} value={account.id}>
												{account.name} ({account.type === 'INCOME' ? 'Income' : 'Expense'})
											</option>
										))}
									</SelectInput>
								)}
							</Field>

							<Field
								id={`budget-lines-${index}-plannedAmount`}
								label="Planned amount"
								error={errorOf(`lines.${index}.plannedAmount`)}
								isRequired
							>
								{(props) => (
									<AmountInput
										{...props}
										name="linePlannedAmount"
										placeholder="0.00"
										value={line.plannedAmount}
										onChange={(event) =>
											updateLine(line.key, { plannedAmount: event.target.value })
										}
									/>
								)}
							</Field>

							<button
								type="button"
								onClick={() =>
									setLines((current) =>
										current.length === 1
											? current
											: current.filter((candidate) => candidate.key !== line.key)
									)
								}
								disabled={lines.length === 1}
								aria-label={`Remove line ${index + 1}`}
								className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'sm:mb-1' })}
							>
								<Trash2 aria-hidden="true" className="size-4" />
							</button>
						</li>
					))}
				</ul>

				<div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
					<span className="text-sm text-muted-foreground">
						Planned total. The server stores the authoritative amounts.
					</span>
					<span className="text-lg font-semibold tabular-nums">{formatAmount(plannedTotal)}</span>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending || !canSubmit} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : budget == null ? 'Create budget' : 'Save changes'}
				</button>
				<Link
					href={budget == null ? '/budgets' : `/budgets/${budget.id}`}
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
