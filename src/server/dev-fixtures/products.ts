import type { Product, ProductInput, ProductKind } from '@/lib/masters/product'
import { nextId, paginate, type ListQuery, type ListResult } from '@/server/dev-fixtures/store'

const products: Product[] = [
	{
		id: 'product-001',
		name: 'Office chair',
		kind: 'goods',
		category: 'Seating',
		salesPrice: '1500.00',
		purchaseCost: '1000.00',
		archivedAt: null
	},
	{
		id: 'product-002',
		name: 'Wooden dining table',
		kind: 'goods',
		category: 'Tables',
		salesPrice: '18500.00',
		purchaseCost: '12400.00',
		archivedAt: null
	},
	{
		id: 'product-003',
		name: 'Three-seater sofa',
		kind: 'goods',
		category: 'Seating',
		salesPrice: '32000.00',
		purchaseCost: '21500.00',
		archivedAt: null
	},
	{
		id: 'product-004',
		name: 'On-site assembly',
		kind: 'service',
		category: 'Services',
		salesPrice: '2000.00',
		purchaseCost: '0.00',
		archivedAt: null
	},
	{
		id: 'product-005',
		name: 'Study desk and chair set',
		kind: 'combo',
		category: 'Bundles',
		salesPrice: '24000.00',
		purchaseCost: '16200.00',
		archivedAt: null
	},
	{
		id: 'product-006',
		name: 'Steel filing cabinet',
		kind: 'goods',
		category: 'Storage',
		salesPrice: '9800.00',
		purchaseCost: '6900.00',
		archivedAt: '2026-07-18'
	}
]

export function listProducts(
	query: ListQuery & { kind: ProductKind | 'all' }
): ListResult<Product> {
	const search = query.search.trim().toLowerCase()
	const matched = products
		.filter((product) => query.includeArchived || product.archivedAt == null)
		.filter((product) => query.kind === 'all' || product.kind === query.kind)
		.filter(
			(product) =>
				search === '' ||
				product.name.toLowerCase().includes(search) ||
				product.category.toLowerCase().includes(search)
		)
		.sort((left, right) => left.name.localeCompare(right.name))

	return paginate(matched, query.page, query.pageSize)
}

export function getProduct(id: string): Product | undefined {
	return products.find((product) => product.id === id)
}

export function createProduct(input: ProductInput): Product {
	const product: Product = { id: nextId('product', products), ...input, archivedAt: null }
	products.push(product)
	return product
}

export function updateProduct(id: string, input: ProductInput): Product | undefined {
	const index = products.findIndex((product) => product.id === id)
	const existing = products[index]
	if (existing == null) return undefined

	const updated: Product = { ...existing, ...input }
	products[index] = updated
	return updated
}

export function setProductArchived(id: string, isArchived: boolean): Product | undefined {
	const product = getProduct(id)
	if (product == null) return undefined

	product.archivedAt = isArchived ? new Date().toISOString().slice(0, 10) : null
	return product
}

export function listCategories(): readonly string[] {
	return [...new Set(products.map((product) => product.category))].sort()
}
