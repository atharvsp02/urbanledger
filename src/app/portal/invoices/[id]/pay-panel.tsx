'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import type { PaymentOptions } from '@/lib/contracts/payment'
import type { PortalDocumentDetail } from '@/lib/contracts/portal'
import { formatAmount, formatBusinessDate, trimMoneyScale } from '@/lib/format'
import {
	finalizePortalPaymentAction,
	readPortalAttemptStatusAction,
	readPortalPaymentAction,
	startPortalPaymentAction
} from '@/app/portal/actions'

type Committed = {
	paymentId: string | null
	receiptNumber: string
	amount: string
	paymentDate: string
	journalName: string
	remaining: string
}

type Phase =
	| { name: 'idle' }
	| { name: 'pending' }
	| { name: 'failed'; message: string }
	| { name: 'committed'; receipt: Committed }

export function PortalPayPanel({
	document,
	options,
	documentRevision,
	today
}: {
	document: PortalDocumentDetail
	options: PaymentOptions
	documentRevision: number
	today: string
}) {
	const [phase, setPhase] = useState<Phase>({ name: 'idle' })
	const [amount, setAmount] = useState(() => trimMoneyScale(document.outstandingAmount))
	const [paymentDate, setPaymentDate] = useState(today)
	const [journalId, setJournalId] = useState(options.liquidityJournals[0]?.id ?? '')
	const [attemptKey] = useState(() => crypto.randomUUID())
	const [finalizeKey] = useState(() => crypto.randomUUID())
	const [isRunning, startTransition] = useTransition()

	const hasJournals = options.liquidityJournals.length > 0

	function pay() {
		setPhase({ name: 'pending' })

		startTransition(async () => {
			const attempt = await startPortalPaymentAction({
				operationKey: attemptKey,
				documentId: document.id,
				expectedDocumentRevision: documentRevision,
				paymentDate,
				amount
			})

			if (!attempt.ok) {
				setPhase({ name: 'failed', message: attempt.error.message })
				return
			}

			// An attempt whose outcome is already known is never paid twice.
			const status = await readPortalAttemptStatusAction(attempt.data.id)
			const current = status.ok ? status.data : attempt.data

			if (current.status === 'SUCCEEDED') {
				setPhase({
					name: 'failed',
					message: 'This payment was already completed. Reload to see the receipt.'
				})
				return
			}

			const finalized = await finalizePortalPaymentAction({
				operationKey: finalizeKey,
				attemptId: current.id,
				expectedRevision: current.revision,
				journalId,
				outcome: 'SUCCEEDED',
				documentId: document.id
			})

			if (!finalized.ok) {
				setPhase({ name: 'failed', message: finalized.error.message })
				return
			}

			const journal = options.liquidityJournals.find((entry) => entry.id === journalId)
			const paymentId = finalized.data.paymentId
			const receipt = paymentId == null ? null : await readPortalPaymentAction(paymentId)
			const committedAmount = receipt?.ok === true ? receipt.data.amount : Number(amount).toFixed(2)
			const remaining = (
				Math.round((Number(document.outstandingAmount) - Number(committedAmount)) * 100) / 100
			).toFixed(2)

			setPhase({
				name: 'committed',
				receipt: {
					paymentId,
					receiptNumber:
						receipt?.ok === true ? receipt.data.number : finalized.data.document.number,
					amount: committedAmount,
					paymentDate: receipt?.ok === true ? receipt.data.paymentDate : paymentDate,
					journalName: journal == null ? 'Selected method' : `${journal.code} ${journal.name}`,
					remaining: remaining.startsWith('-') ? '0.00' : remaining
				}
			})
		})
	}

	if (phase.name === 'committed') {
		return (
			<div className="flex flex-col gap-4">
				<p className="flex items-start gap-2 text-sm font-semibold text-success" role="status">
					<CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					Payment successful.
				</p>
				<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Invoice
						</dt>
						<dd className="mt-0.5 text-sm">{document.number}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Receipt
						</dt>
						<dd className="mt-0.5 text-sm">{phase.receipt.receiptNumber}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Amount paid
						</dt>
						<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(phase.receipt.amount)}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Payment date
						</dt>
						<dd className="mt-0.5 text-sm">{formatBusinessDate(phase.receipt.paymentDate)}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Method
						</dt>
						<dd className="mt-0.5 text-sm">{phase.receipt.journalName}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Remaining balance
						</dt>
						<dd className="mt-0.5 text-sm tabular-nums">{formatAmount(phase.receipt.remaining)}</dd>
					</div>
				</dl>
				<div className="flex flex-wrap gap-3">
					<Link href="/portal" className={buttonVariants({ size: 'sm' })}>
						View updated documents
					</Link>
					<Link
						href={`/api/invoices/${document.id}/pdf`}
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Download invoice PDF
					</Link>
					{phase.receipt.paymentId != null && (
						<>
							<Link
								href={`/portal/payments/${phase.receipt.paymentId}`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								View receipt
							</Link>
							<Link
								href={`/api/payments/${phase.receipt.paymentId}/receipt.pdf`}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Download receipt PDF
							</Link>
						</>
					)}
				</div>
				<p className="text-sm text-muted-foreground">
					This payment was recorded by the built-in simulator. No real money was transferred.
				</p>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-4">
			<FieldRow className="sm:grid-cols-3">
				<Field
					id="portal-amount"
					label="Amount"
					hint={`Up to the outstanding ${formatAmount(document.outstandingAmount)}.`}
					isRequired
					inRow
				>
					{(props) => (
						<AmountInput
							{...props}
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
						/>
					)}
				</Field>
				<Field id="portal-paymentDate" label="Payment date" isRequired inRow>
					{(props) => (
						<TextInput
							{...props}
							type="date"
							value={paymentDate}
							onChange={(event) => setPaymentDate(event.target.value)}
						/>
					)}
				</Field>
				<Field
					id="portal-journalId"
					label="Method"
					hint={
						hasJournals ? 'Cash or bank method allowed by this business.' : 'No method available.'
					}
					isRequired
					inRow
				>
					{(props) => (
						<SelectInput
							{...props}
							value={journalId}
							onChange={(event) => setJournalId(event.target.value)}
							disabled={!hasJournals}
						>
							{options.liquidityJournals.map((journal) => (
								<option key={journal.id} value={journal.id}>
									{journal.code} {journal.name}
								</option>
							))}
						</SelectInput>
					)}
				</Field>
			</FieldRow>

			<p className="rounded-xl border border-warning/25 bg-warning/6 p-3 text-sm text-muted-foreground">
				This is a simulated payment. Clicking Pay records the payment inside UrbanLedger and issues
				a receipt, but no real money is transferred and no card or bank details are collected.
			</p>

			{phase.name === 'failed' && (
				<p
					role="alert"
					className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/6 p-3 text-sm text-danger"
				>
					<AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
					<span>{phase.message}</span>
				</p>
			)}

			<div>
				<button
					type="button"
					onClick={pay}
					disabled={isRunning || phase.name === 'pending' || !hasJournals}
					className={buttonVariants()}
				>
					{(isRunning || phase.name === 'pending') && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isRunning || phase.name === 'pending' ? 'Processing' : 'Pay'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isRunning || phase.name === 'pending'
					? 'Processing the payment. Waiting for the server to confirm.'
					: ''}
			</p>
		</div>
	)
}
