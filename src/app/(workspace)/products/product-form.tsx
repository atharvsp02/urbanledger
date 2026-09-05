'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldGroup, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { AmountInput, RadioField, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import {
	productKinds,
	PRODUCT_KIND_HINTS,
	PRODUCT_KIND_LABELS,
	type ProductCategorySummary,
	type ProductSummary
} from '@/lib/masters/product'
import { saveProductAction } from '@/app/(workspace)/products/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Product name',
	kind: 'Product type',
	categoryId: 'Category',
	sku: 'SKU',
	salesPrice: 'Sales price',
	purchaseCost: 'Purchase cost'
}

export function ProductForm({
	product,
	categories
}: {
	product?: ProductSummary
	categories: readonly ProductCategorySummary[]
}) {
	const [state, formAction, isPending] = useActionState(saveProductAction, null)
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{product != null && (
				<>
					<input type="hidden" name="productId" value={product.id} />
					<input type="hidden" name="revision" value={product.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'product', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field id="product-name" label={FIELD_LABELS.name} error={errorOf('name')} isRequired>
					{(props) => <TextInput {...props} name="name" defaultValue={product?.name} />}
				</Field>

				<FieldGroup id="product-kind" label={FIELD_LABELS.kind} error={errorOf('kind')} isRequired>
					{productKinds.map((value) => (
						<RadioField
							key={value}
							name="kind"
							value={value}
							label={PRODUCT_KIND_LABELS[value]}
							description={PRODUCT_KIND_HINTS[value]}
							defaultChecked={(product?.kind ?? 'GOODS') === value}
						/>
					))}
				</FieldGroup>

				<FieldRow>
					<Field
						id="product-categoryId"
						label={FIELD_LABELS.categoryId}
						hint={
							categories.length === 0
								? 'Create a category before adding products.'
								: 'Archived categories are not offered.'
						}
						error={errorOf('categoryId')}
						isRequired
						inRow
					>
						{(props) => (
							<SelectInput
								{...props}
								name="categoryId"
								defaultValue={product?.categoryId ?? ''}
								disabled={categories.length === 0}
							>
								<option value="" disabled>
									Choose a category
								</option>
								{categories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
					<Field
						id="product-sku"
						label={FIELD_LABELS.sku}
						hint="Optional, unique within the business."
						error={errorOf('sku')}
						inRow
					>
						{(props) => <TextInput {...props} name="sku" defaultValue={product?.sku ?? ''} />}
					</Field>
				</FieldRow>

				<FieldRow>
					<Field
						id="product-salesPrice"
						label={FIELD_LABELS.salesPrice}
						hint="Tax-exclusive price used on sales documents."
						error={errorOf('salesPrice')}
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
						error={errorOf('purchaseCost')}
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
				<button
					type="submit"
					disabled={isPending || categories.length === 0}
					className={buttonVariants()}
				>
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
