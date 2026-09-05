import { z } from 'zod'

export const productKinds = ['GOODS', 'SERVICE', 'COMBO'] as const
export type ProductKind = (typeof productKinds)[number]

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
	GOODS: 'Goods',
	SERVICE: 'Service',
	COMBO: 'Combo'
}

export const PRODUCT_KIND_HINTS: Record<ProductKind, string> = {
	GOODS: 'Stocked item with receipt and delivery movements.',
	SERVICE: 'Accepted rather than received; never creates stock.',
	COMBO: 'A separately priced bundled item, stocked as its own product.'
}

export const productSortColumns = [
	'name',
	'kind',
	'salesPrice',
	'purchaseCost',
	'createdAt'
] as const
export type ProductSortColumn = (typeof productSortColumns)[number]

export const PRODUCT_SORT_LABELS: Record<ProductSortColumn, string> = {
	name: 'Name',
	kind: 'Type',
	salesPrice: 'Sales price',
	purchaseCost: 'Purchase cost',
	createdAt: 'Created'
}

// Prices stay decimal strings end to end; the bounded scale matches the
// numeric(20,4) unit-price column.
const moneySchema = z
	.string()
	.trim()
	.regex(/^\d{1,11}(\.\d{1,4})?$/, 'Enter a non-negative amount with up to four decimals.')

export const productInputSchema = z.object({
	name: z.string().trim().min(1, 'Enter a product name.').max(160, 'Use 160 characters or fewer.'),
	kind: z.enum(productKinds, { message: 'Choose a product type.' }),
	categoryId: z.uuid({ message: 'Choose a category.' }),
	sku: z
		.string()
		.trim()
		.max(64, 'Use 64 characters or fewer.')
		.transform((value) => (value.length === 0 ? null : value))
		.nullable(),
	salesPrice: moneySchema,
	purchaseCost: moneySchema
})

export type ProductInput = z.output<typeof productInputSchema>

export const productListQuerySchema = z.object({
	search: z.string().trim().max(160).default(''),
	kind: z.enum([...productKinds, 'ALL']).default('ALL'),
	categoryId: z.union([z.uuid(), z.literal('ALL')]).catch('ALL'),
	includeArchived: z.boolean().default(false),
	sort: z.enum(productSortColumns).default('name'),
	direction: z.enum(['asc', 'desc']).default('asc'),
	page: z.coerce.number().int().min(1).catch(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export type ProductListQuery = z.input<typeof productListQuerySchema>

export type ProductSummary = {
	id: string
	name: string
	kind: ProductKind
	sku: string | null
	categoryId: string
	categoryName: string
	salesPrice: string
	purchaseCost: string
	archivedAt: string | null
	revision: number
}

export const productCategoryInputSchema = z.object({
	name: z.string().trim().min(1, 'Enter a category name.').max(120, 'Use 120 characters or fewer.')
})

export type ProductCategoryInput = z.output<typeof productCategoryInputSchema>

export type ProductCategorySummary = {
	id: string
	name: string
	archivedAt: string | null
	productCount: number
}
