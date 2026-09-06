'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { CustomerInvoiceDetail } from '@/lib/contracts/customer-invoice'
import { formatAmount, formatQuantity, trimMoneyScale } from '@/lib/format'
import { saveDraftCustomerInvoiceAction } from '@/app/(workspace)/sales/invoices/actions'

const FIELD_LABELS: Record<string, string> = {
	invoiceDate: 'Invoice date',
	dueDate: 'Due date',
	reference: 'Reference'
}

export function CustomerInvoiceForm({ invoice }: { invoice: CustomerInvoiceDetail }) {
	const [state, formAction, isPending] = useActionState(saveDraftCustomerInvoiceAction, null)
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="customerInvoiceId" value={invoice.id} />
			<input type="hidden" name="expectedRevision" value={invoice.revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'invoice', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow className="sm:grid-cols-3">
					<Field
						id="invoice-invoiceDate"
						label={FIELD_LABELS.invoiceDate}
						error={errorOf('invoiceDate')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								type="date"
								name="invoiceDate"
								defaultValue={invoice.invoiceDate}
							/>
						)}
					</Field>
					<Field
						id="invoice-dueDate"
						label={FIELD_LABELS.dueDate}
						hint="On or after the invoice date."
						error={errorOf('dueDate')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="dueDate" defaultValue={invoice.dueDate} />
						)}
					</Field>
					<Field
						id="invoice-reference"
						label={FIELD_LABELS.reference}
						hint="Optional."
						error={errorOf('reference')}
						inRow
					>
						{(props) => (
							<TextInput {...props} name="reference" defaultValue={invoice.reference ?? ''} />
						)}
					</Field>
				</FieldRow>
			</div>

			<div className="rounded-xl border border-border bg-surface">
				<div className="border-b border-border px-5 py-4">
					<h2 className="text-[15px] font-semibold tracking-tight">Lines</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Commercial lines are frozen snapshots of the confirmed sales order and cannot change
						here.
					</p>
				</div>

				<ul className="flex list-none flex-col p-0">
					{invoice.lines.map((line) => (
						<li
							key={line.id}
							className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0"
						>
							<span className="text-sm font-medium">{line.productName}</span>
							<span className="text-xs text-muted-foreground tabular-nums">
								{formatQuantity(line.quantity)} x {formatAmount(trimMoneyScale(line.unitPrice))}
								{line.tax == null ? '' : ` + ${line.tax.name}`} = {formatAmount(line.lineTotal)}
							</span>
						</li>
					))}
				</ul>

				<div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
					<span className="text-sm text-muted-foreground">
						Totals are recalculated by the server when the draft is saved.
					</span>
					<span className="text-lg font-semibold tabular-nums">{formatAmount(invoice.total)}</span>
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
					href={`/sales/invoices/${invoice.id}`}
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
