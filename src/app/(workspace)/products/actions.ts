'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionResult } from '@/lib/contracts/errors'
import {
	productCategoryInputSchema,
	productInputSchema,
	type ProductKind
} from '@/lib/masters/product'
import { createProductCategory } from '@/server/masters/product-categories'
import { createProduct, setProductArchived, updateProduct } from '@/server/masters/products'
import { toActionResult } from '@/server/actions/result'

export type ProductActionState = ActionResult<{ id: string }> | null
export type CategoryActionState = ActionResult<{ id: string; name: string }> | null

export async function saveProductAction(
	_state: ProductActionState,
	formData: FormData
): Promise<ProductActionState> {
	const productId = String(formData.get('productId') ?? '')
	const revision = Number(formData.get('revision') ?? '0')
	const read = (key: string) => String(formData.get(key) ?? '')

	const result = await toActionResult(async () => {
		const input = productInputSchema.parse({
			name: read('name'),
			kind: read('kind') as ProductKind,
			categoryId: read('categoryId'),
			sku: read('sku'),
			salesPrice: read('salesPrice'),
			purchaseCost: read('purchaseCost')
		})

		return productId === '' ? createProduct(input) : updateProduct(productId, revision, input)
	})

	if (result.ok) {
		revalidatePath('/products')
		redirect(`/products/${result.data.id}`)
	}

	return result
}

export async function setProductArchivedAction(
	productId: string,
	revision: number,
	isArchived: boolean
) {
	const result = await toActionResult(() => setProductArchived(productId, revision, isArchived))

	if (!result.ok) {
		throw new Error(result.error.message)
	}

	revalidatePath('/products')
	revalidatePath(`/products/${productId}`)
}

export async function createCategoryAction(
	_state: CategoryActionState,
	formData: FormData
): Promise<CategoryActionState> {
	const result = await toActionResult(() =>
		createProductCategory(
			productCategoryInputSchema.parse({ name: String(formData.get('name') ?? '') })
		)
	)

	if (result.ok) {
		revalidatePath('/products')
		revalidatePath('/products/categories')
	}

	return result
}
