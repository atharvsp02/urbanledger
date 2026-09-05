import type { FieldErrors } from '@/lib/masters/form-state'

export const PRODUCT_KINDS = ['goods', 'service', 'combo'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
	goods: 'Goods',
	service: 'Service',
	combo: 'Combo'
}

export type Product = {
	id: string
	name: string
	kind: ProductKind
	category: string
	salesPrice: string
	purchaseCost: string
	archivedAt: string | null
}

export type ProductInput = Omit<Product, 'id' | 'archivedAt'>

// Prices stay decimal strings end to end; a bounded scale keeps room for the
// server's own multiplication and aggregation later.
const DECIMAL_PATTERN = /^\d{1,11}(\.\d{1,2})?$/

function validateMoney(raw: string, label: string): { value: string; error?: string } {
	const value = raw.trim()
	if (value.length === 0) return { value, error: `Enter a ${label}` }
	if (!DECIMAL_PATTERN.test(value)) {
		return { value, error: 'Enter a non-negative amount with up to two decimals' }
	}
	const [whole, fraction = ''] = value.split('.')
	return { value: `${whole}.${fraction.padEnd(2, '0')}` }
}

export function parseProductInput(form: {
	name: string
	kind: string
	category: string
	salesPrice: string
	purchaseCost: string
}): { input: ProductInput; errors: FieldErrors } {
	const errors: FieldErrors = {}
	const name = form.name.trim()
	const category = form.category.trim()
	const kind = PRODUCT_KINDS.includes(form.kind as ProductKind)
		? (form.kind as ProductKind)
		: 'goods'

	if (name.length === 0) errors.name = 'Enter a product name'
	else if (name.length > 120) errors.name = 'Use 120 characters or fewer'

	if (!PRODUCT_KINDS.includes(form.kind as ProductKind)) errors.kind = 'Choose a product type'

	if (category.length === 0) errors.category = 'Enter a category'
	else if (category.length > 60) errors.category = 'Use 60 characters or fewer'

	const salesPrice = validateMoney(form.salesPrice, 'sales price')
	if (salesPrice.error != null) errors.salesPrice = salesPrice.error

	const purchaseCost = validateMoney(form.purchaseCost, 'purchase cost')
	if (purchaseCost.error != null) errors.purchaseCost = purchaseCost.error

	return {
		input: {
			name,
			kind,
			category,
			salesPrice: salesPrice.value,
			purchaseCost: purchaseCost.value
		},
		errors
	}
}
