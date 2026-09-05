'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { SalesOrderDetail, SalesOrderOptions } from '@/lib/contracts/sales-order'
import { formatAmount, trimMoneyScale } from '@/lib/format'
import { saveSalesOrderAction } from '@/app/(workspace)/sales/orders/actions'

const FIELD_LABELS: Record<string, string> = {
	customerId: 'Customer',
	orderDate: 'Order date',
	lines: 'Product lines'
}

type DraftLine = {
	key: string
	productId: string
	quantity: string
	unitPrice: string
	taxId: string
	analyticAccountId: string
}

function newLine(): DraftLine {
	return {
		key: crypto.randomUUID(),
		productId: '',
		quantity: '1',
		unitPrice: '',
		taxId: '',
		analyticAccountId: ''
	}
}

// Browser arithmetic is preview only; committed totals come back from the
// server at the canonical scale.
function previewLine(line: DraftLine, rate: number) {
	const quantity = Number(line.quantity)
	const unitPrice = Number(line.unitPrice)

	if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return null

	const net = Math.round(quantity * unitPrice * 100) / 100
	const tax = Math.round(net * rate) / 100
	return { net, tax, gross: net + tax }
}

export function SalesOrderForm({
	order,
	options
}: {
	order?: SalesOrderDetail
	options: SalesOrderOptions
}) {
	const [state, formAction, isPending] = useActionState(saveSalesOrderAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const [lines, setLines] = useState<DraftLine[]>(() =>
		order == null
			? [newLine()]
			: order.lines.map((line) => ({
					key: line.id,
					productId: line.productId,
					quantity: trimMoneyScale(line.quantity, 0),
					unitPrice: trimMoneyScale(line.unitPrice),
					taxId: line.tax?.id ?? '',
					analyticAccountId: line.analyticAccount?.id ?? ''
				}))
	)

	const errorOf = (field: string) => firstFieldError(state, field)
	const rateOf = (taxId: string) =>
		Number(options.taxes.find((tax) => tax.id === taxId)?.rate ?? '0')

	const totals = useMemo(() => {
		let net = 0
		let tax = 0

		for (const line of lines) {
			const preview = previewLine(line, rateOf(line.taxId))
			if (preview == null) continue
			net += preview.net
			tax += preview.tax
		}

		const round = (value: number) => (Math.round(value * 100) / 100).toFixed(2)
		return { net: round(net), tax: round(tax), gross: round(net + tax) }
	}, [lines, options.taxes])

	function updateLine(key: string, patch: Partial<DraftLine>) {
		setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
	}

	const canSubmit = options.customers.length > 0 && options.products.length > 0

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />
			{order != null && (
				<>
					<input type="hidden" name="salesOrderId" value={order.id} />
					<input type="hidden" name="expectedRevision" value={order.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'order', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldRow>
					<Field
						id="order-customerId"
						label={FIELD_LABELS.customerId}
						hint={
							options.customers.length === 0
								? 'Create an active Customer or Both contact first.'
								: 'Only active Customer and Both contacts appear here.'
						}
						error={errorOf('customerId')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="customerId"
								defaultValue={order?.customer.id ?? ''}
								disabled={options.customers.length === 0}
							>
								<option value="" disabled>
									Choose a customer
								</option>
								{options.customers.map((customer) => (
									<option key={customer.id} value={customer.id}>
										{customer.name}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
					<Field
						id="order-orderDate"
						label={FIELD_LABELS.orderDate}
						error={errorOf('orderDate')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="date" name="orderDate" defaultValue={order?.orderDate} />
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
					{lines.map((line, index) => {
						const preview = previewLine(line, rateOf(line.taxId))

						return (
							<li
								key={line.key}
								className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.4fr)_6rem_8rem_minmax(0,1fr)_minmax(0,1fr)_7rem_auto] lg:items-end"
							>
								<Field
									id={`order-lines-${index}-productId`}
									label="Product"
									error={errorOf(`lines.${index}.productId`)}
									isRequired
								>
									{(props) => (
										<SelectInput
											{...props}
											name="lineProductId"
											value={line.productId}
											onChange={(event) => {
												const product = options.products.find(
													(candidate) => candidate.id === event.target.value
												)
												updateLine(line.key, {
													productId: event.target.value,
													unitPrice:
														line.unitPrice === '' && product != null
															? trimMoneyScale(product.salesPrice)
															: line.unitPrice
												})
											}}
										>
											<option value="" disabled>
												Choose a product
											</option>
											{options.products.map((product) => (
												<option key={product.id} value={product.id}>
													{product.name}
												</option>
											))}
										</SelectInput>
									)}
								</Field>

								<Field
									id={`order-lines-${index}-quantity`}
									label="Quantity"
									error={errorOf(`lines.${index}.quantity`)}
									isRequired
								>
									{(props) => (
										<AmountInput
											{...props}
											name="lineQuantity"
											value={line.quantity}
											onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
										/>
									)}
								</Field>

								<Field
									id={`order-lines-${index}-unitPrice`}
									label="Unit price"
									error={errorOf(`lines.${index}.unitPrice`)}
									isRequired
								>
									{(props) => (
										<AmountInput
											{...props}
											name="lineUnitPrice"
											placeholder="0.00"
											value={line.unitPrice}
											onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
										/>
									)}
								</Field>

								<Field
									id={`order-lines-${index}-taxId`}
									label="Sales tax"
									error={errorOf(`lines.${index}.taxId`)}
								>
									{(props) => (
										<SelectInput
											{...props}
											name="lineTaxId"
											value={line.taxId}
											onChange={(event) => updateLine(line.key, { taxId: event.target.value })}
										>
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
									id={`order-lines-${index}-analyticAccountId`}
									label="Analytic account"
									error={errorOf(`lines.${index}.analyticAccountId`)}
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
											<option value="">No analytic account</option>
											{options.incomeAnalyticAccounts.map((account) => (
												<option key={account.id} value={account.id}>
													{account.name}
												</option>
											))}
										</SelectInput>
									)}
								</Field>

								<p className="text-sm tabular-nums lg:pb-3 lg:text-right">
									<span className="block text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase lg:hidden">
										Line gross
									</span>
									{preview == null ? '-' : formatAmount(preview.gross.toFixed(2))}
								</p>

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
									className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'lg:mb-1' })}
								>
									<Trash2 aria-hidden="true" className="size-4" />
								</button>
							</li>
						)
					})}
				</ul>

				<dl className="flex flex-col gap-2 border-t border-border px-5 py-4 text-sm">
					<div className="flex items-baseline justify-between gap-4">
						<dt className="text-muted-foreground">Estimated net</dt>
						<dd className="tabular-nums">{formatAmount(totals.net)}</dd>
					</div>
					<div className="flex items-baseline justify-between gap-4">
						<dt className="text-muted-foreground">Estimated tax</dt>
						<dd className="tabular-nums">{formatAmount(totals.tax)}</dd>
					</div>
					<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
						<dt className="font-semibold">Estimated gross</dt>
						<dd className="text-lg font-semibold tabular-nums">{formatAmount(totals.gross)}</dd>
					</div>
				</dl>
				<p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
					The server recalculates and stores the authoritative amounts.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending || !canSubmit} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : order == null ? 'Create sales order' : 'Save changes'}
				</button>
				<Link
					href={order == null ? '/sales/orders' : `/sales/orders/${order.id}`}
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
