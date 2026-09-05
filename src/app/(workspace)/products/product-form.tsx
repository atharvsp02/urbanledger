'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldGroup, FieldRow } from '@/components/ui/field'
import { FormErrorSummary, type FieldErrorEntry } from '@/components/ui/form-error-summary'
import { AmountInput, RadioField, TextInput } from '@/components/ui/inputs'
import { PRODUCT_KINDS, PRODUCT_KIND_LABELS, type Product } from '@/lib/masters/product'
import { emptyMasterFormState } from '@/lib/masters/form-state'
import { saveProductAction } from '@/app/(workspace)/products/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Product name',
	kind: 'Product type',
	category: 'Category',
	salesPrice: 'Sales price',
	purchaseCost: 'Purchase cost'
}

const KIND_HINTS: Record<string, string> = {
	goods: 'Stocked item with receipt and delivery movements.',
	service: 'Accepted rather than received; never creates stock.',
	combo: 'A separately priced bundled item, stocked as its own product.'
}

export function ProductForm({ product }: { product?: Product }) {
	const [state, formAction, isPending] = useActionState(saveProductAction, emptyMasterFormState)

	const errorEntries: readonly FieldErrorEntry[] = Object.entries(state.errors).flatMap(
		([field, message]) =>
			message == null
				? []
				: [{ fieldId: `product-${field}`, label: FIELD_LABELS[field] ?? field, message }]
	)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{product != null && <input type="hidden" name="productId" value={product.id} />}

			<FormErrorSummary errors={errorEntries} description={state.message} />

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field id="product-name" label={FIELD_LABELS.name} error={state.errors.name} isRequired>
					{(props) => <TextInput {...props} name="name" defaultValue={product?.name} />}
				</Field>

				<FieldGroup
					id="product-kind"
					label={FIELD_LABELS.kind}
					error={state.errors.kind}
					isRequired
				>
					{PRODUCT_KINDS.map((value) => (
						<RadioField
							key={value}
							name="kind"
							value={value}
							label={PRODUCT_KIND_LABELS[value]}
							description={KIND_HINTS[value]}
							defaultChecked={(product?.kind ?? 'goods') === value}
						/>
					))}
				</FieldGroup>

				<Field
					id="product-category"
					label={FIELD_LABELS.category}
					error={state.errors.category}
					isRequired
				>
					{(props) => <TextInput {...props} name="category" defaultValue={product?.category} />}
				</Field>

				<FieldRow>
					<Field
						id="product-salesPrice"
						label={FIELD_LABELS.salesPrice}
						hint="Tax-exclusive price used on sales documents."
						error={state.errors.salesPrice}
						isRequired
						inRow
					>
						{(props) => (
							<AmountInput
								{...props}
								name="salesPrice"
								placeholder="0.00"
								defaultValue={product?.salesPrice}
							/>
						)}
					</Field>
					<Field
						id="product-purchaseCost"
						label={FIELD_LABELS.purchaseCost}
						hint="Tax-exclusive cost used on purchase documents."
						error={state.errors.purchaseCost}
						isRequired
						inRow
					>
						{(props) => (
							<AmountInput
								{...props}
								name="purchaseCost"
								placeholder="0.00"
								defaultValue={product?.purchaseCost}
							/>
						)}
					</Field>
				</FieldRow>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : product == null ? 'Create product' : 'Save changes'}
				</button>
				<Link
					href={product == null ? '/products' : `/products/${product.id}`}
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
