'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { VendorBillDetail, VendorBillOptions } from '@/lib/contracts/vendor-bill'
import { formatAmount, formatQuantity, trimMoneyScale } from '@/lib/format'
import { saveDraftVendorBillAction } from '@/app/(workspace)/purchases/bills/actions'

const FIELD_LABELS: Record<string, string> = {
	billDate: 'Bill date',
	dueDate: 'Due date',
	vendorReference: 'Vendor reference',
	lines: 'Lines'
}

export function VendorBillForm({
	bill,
	options
}: {
	bill: VendorBillDetail
	options: VendorBillOptions
}) {
	const [state, formAction, isPending] = useActionState(saveDraftVendorBillAction, null)
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="vendorBillId" value={bill.id} />
			<input type="hidden" name="expectedRevision" value={bill.revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'bill', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow className="sm:grid-cols-3">
					<Field
						id="bill-billDate"
						label={FIELD_LABELS.billDate}
						error={errorOf('billDate')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="billDate" defaultValue={bill.billDate} />
						)}
					</Field>
					<Field
						id="bill-dueDate"
						label={FIELD_LABELS.dueDate}
						hint="On or after the bill date."
						error={errorOf('dueDate')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="dueDate" defaultValue={bill.dueDate} />
						)}
					</Field>
					<Field
						id="bill-vendorReference"
						label={FIELD_LABELS.vendorReference}
						hint="Optional."
						error={errorOf('vendorReference')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								name="vendorReference"
								defaultValue={bill.vendorReference ?? ''}
							/>
						)}
					</Field>
				</FieldRow>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<div className="border-b border-border px-5 py-4">
					<h2 className="text-[15px] font-semibold tracking-tight">{FIELD_LABELS.lines}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Product, quantity and unit price are frozen snapshots of the confirmed order. Only the
						purchase tax and Expense analytic account can change here.
					</p>
				</div>

				<ul className="flex list-none flex-col p-0">
					{bill.lines.map((line, index) => (
						<li
							key={line.id}
							className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end"
						>
							<input type="hidden" name="lineId" value={line.id} />

							<div className="min-w-0">
								<p className="text-sm font-medium">{line.productName}</p>
								<p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
									{formatQuantity(line.quantity)} x {formatAmount(trimMoneyScale(line.unitPrice))} ={' '}
									{formatAmount(line.lineNetTotal)}
								</p>
							</div>

							<Field
								id={`bill-lines-${index}-taxId`}
								label="Purchase tax"
								error={errorOf(`lines.${index}.taxId`)}
							>
								{(props) => (
									<SelectInput {...props} name="lineTaxId" defaultValue={line.tax?.id ?? ''}>
										<option value="">No tax</option>
										{options.taxes.map((tax) => (
											<option key={tax.id} value={tax.id}>
												{tax.name} ({trimMoneyScale(tax.rate, 0)}%)
											</option>
										))}
									</SelectInput>
								)}
							</Field>

							<Field
								id={`bill-lines-${index}-analyticAccountId`}
								label="Analytic account"
								error={errorOf(`lines.${index}.analyticAccountId`)}
							>
								{(props) => (
									<SelectInput
										{...props}
										name="lineAnalyticAccountId"
										defaultValue={line.analyticAccount?.id ?? ''}
									>
										<option value="">No analytic account</option>
										{options.expenseAnalyticAccounts.map((account) => (
											<option key={account.id} value={account.id}>
												{account.name}
											</option>
										))}
									</SelectInput>
								)}
							</Field>
						</li>
					))}
				</ul>

				<div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
					<span className="text-sm text-muted-foreground">
						Totals are recalculated by the server when the draft is saved.
					</span>
					<span className="text-lg font-semibold tabular-nums">{formatAmount(bill.total)}</span>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : 'Save changes'}
				</button>
				<Link
					href={`/purchases/bills/${bill.id}`}
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
