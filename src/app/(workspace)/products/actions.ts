'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { MasterFormState } from '@/lib/masters/form-state'
import { parseProductInput } from '@/lib/masters/product'
import {
	createProduct,
	getProduct,
	setProductArchived,
	updateProduct
} from '@/server/dev-fixtures/products'

export async function saveProductAction(
	previousState: MasterFormState,
	formData: FormData
): Promise<MasterFormState> {
	const productId = String(formData.get('productId') ?? '')
	const read = (key: string) => String(formData.get(key) ?? '')
	const { input, errors } = parseProductInput({
		name: read('name'),
		kind: read('kind'),
		category: read('category'),
		salesPrice: read('salesPrice'),
		purchaseCost: read('purchaseCost')
	})

	if (Object.keys(errors).length > 0) {
		return { status: 'invalid', errors, message: 'Nothing was saved.' }
	}

	const saved = productId === '' ? createProduct(input) : updateProduct(productId, input)
	if (saved == null) {
		return { status: 'failed', errors: {}, message: 'This product no longer exists.' }
	}

	revalidatePath('/products')
	redirect(`/products/${saved.id}`)
}

export async function setProductArchivedAction(productId: string, isArchived: boolean) {
	if (getProduct(productId) == null) throw new Error('This product no longer exists.')

	setProductArchived(productId, isArchived)
	revalidatePath('/products')
	revalidatePath(`/products/${productId}`)
}
