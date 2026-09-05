'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { PurchaseOrderDetail } from '@/lib/contracts/purchase-order'
import { formatAmount, trimMoneyScale } from '@/lib/format'
import { savePurchaseOrderAction } from '@/app/(workspace)/purchases/orders/actions'

const FIELD_LABELS: Record<string, string> = {
	vendorId: 'Vendor',
	orderDate: 'Order date',
	lines: 'Product lines'
}

export type VendorOption = { id: string; name: string }
export type ProductOption = { id: string; name: string; sku: string | null; purchaseCost: string }

type DraftLine = { key: string; productId: string; quantity: string; unitPrice: string }

function newLine(): DraftLine {
	return { key: crypto.randomUUID(), productId: '', quantity: '1', unitPrice: '' }
}

// Browser arithmetic is preview only; the committed totals come back from the
// server with the canonical scale.
function previewLineTotal(quantity: string, unitPrice: string) {
	const parsedQuantity = Number(quantity)
	const parsedPrice = Number(unitPrice)

	if (!Number.isFinite(parsedQuantity) || !Number.isFinite(parsedPrice)) return null

	return (Math.round(parsedQuantity * parsedPrice * 100) / 100).toFixed(2)
}

export function PurchaseOrderForm({
	order,
	vendors,
	products
}: {
	order?: PurchaseOrderDetail
	vendors: readonly VendorOption[]
	products: readonly ProductOption[]
}) {
	const [state, formAction, isPending] = useActionState(savePurchaseOrderAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const [lines, setLines] = useState<DraftLine[]>(() =>
		order == null
			? [newLine()]
			: order.lines.map((line) => ({
					key: line.id,
					productId: line.productId,
					quantity: trimMoneyScale(line.quantity, 0),
					unitPrice: trimMoneyScale(line.unitPrice)
				}))
	)

	const errorOf = (field: string) => firstFieldError(state, field)
	const previewTotal = useMemo(() => {
		let total = 0

		for (const line of lines) {
			const lineTotal = previewLineTotal(line.quantity, line.unitPrice)
			if (lineTotal != null) total += Number(lineTotal)
		}

		return (Math.round(total * 100) / 100).toFixed(2)
	}, [lines])

	function updateLine(key: string, patch: Partial<DraftLine>) {
		setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
	}

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />
			{order != null && (
				<>
					<input type="hidden" name="purchaseOrderId" value={order.id} />
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
						id="order-vendorId"
						label={FIELD_LABELS.vendorId}
						hint={
							vendors.length === 0
								? 'Create an active Vendor or Both contact first.'
								: 'Only active Vendor and Both contacts appear here.'
						}
						error={errorOf('vendorId')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="vendorId"
								defaultValue={order?.vendor.id ?? ''}
								disabled={vendors.length === 0}
							>
								<option value="" disabled>
									Choose a vendor
								</option>
								{vendors.map((vendor) => (
									<option key={vendor.id} value={vendor.id}>
										{vendor.name}
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
						const lineTotal = previewLineTotal(line.quantity, line.unitPrice)

						return (
							<li
								key={line.key}
								className="grid gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_8rem_auto] sm:items-end"
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
												const product = products.find(
													(candidate) => candidate.id === event.target.value
												)
												updateLine(line.key, {
													productId: event.target.value,
													unitPrice:
														line.unitPrice === '' && product != null
															? trimMoneyScale(product.purchaseCost)
															: line.unitPrice
												})
											}}
											disabled={products.length === 0}
										>
											<option value="" disabled>
												Choose a product
											</option>
											{products.map((product) => (
												<option key={product.id} value={product.id}>
													{product.name}
													{product.sku == null ? '' : ` (${product.sku})`}
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

								<p className="text-sm tabular-nums sm:pb-3 sm:text-right">
									<span className="block text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase sm:hidden">
										Line total
									</span>
									{lineTotal == null ? '-' : formatAmount(lineTotal)}
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
									className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'sm:mb-1' })}
								>
									<Trash2 aria-hidden="true" className="size-4" />
								</button>
							</li>
						)
					})}
				</ul>

				<div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4">
					<span className="text-sm text-muted-foreground">
						Estimated total. The server recalculates and stores the authoritative amount.
					</span>
					<span className="text-lg font-semibold tabular-nums">{formatAmount(previewTotal)}</span>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="submit"
					disabled={isPending || vendors.length === 0 || products.length === 0}
					className={buttonVariants()}
				>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : order == null ? 'Create purchase order' : 'Save changes'}
				</button>
				<Link
					href={order == null ? '/purchases/orders' : `/purchases/orders/${order.id}`}
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
