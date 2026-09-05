import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import {
	productInputSchema,
	productListQuerySchema,
	type ProductInput,
	type ProductListQuery,
	type ProductSummary
} from '@/lib/masters/product'
import { requireActor } from '@/server/auth/actor'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'
import { decimalToString } from '@/server/masters/decimal'
import { resolvePage, type PageResult } from '@/server/masters/pagination'

type ProductRow = Prisma.ProductModel & { category: { id: string; name: string } }

function toSummary(product: ProductRow): ProductSummary {
	return {
		id: product.id,
		name: product.name,
		kind: product.kind,
		sku: product.sku,
		categoryId: product.category.id,
		categoryName: product.category.name,
		salesPrice: decimalToString(product.salesPrice),
		purchaseCost: decimalToString(product.purchaseCost),
		archivedAt: product.archivedAt?.toISOString().slice(0, 10) ?? null,
		revision: product.revision
	}
}

export async function listProducts(query: ProductListQuery): Promise<PageResult<ProductSummary>> {
	const actor = await requireActor('masters:read')
	const parsed = productListQuerySchema.parse(query)
	const prisma = getPrisma()

	const where: Prisma.ProductWhereInput = {
		businessId: actor.businessId,
		...(parsed.includeArchived ? {} : { archivedAt: null }),
		...(parsed.kind === 'ALL' ? {} : { kind: parsed.kind }),
		...(parsed.categoryId === 'ALL' ? {} : { categoryId: parsed.categoryId }),
		...(parsed.search === ''
			? {}
			: {
					OR: [
						{ name: { contains: parsed.search, mode: 'insensitive' } },
						{ sku: { contains: parsed.search, mode: 'insensitive' } },
						{ category: { name: { contains: parsed.search, mode: 'insensitive' } } }
					]
				})
	}

	const totalCount = await prisma.product.count({ where })
	const { page, lastPage } = resolvePage(parsed.page, parsed.pageSize, totalCount)
	const rows = await prisma.product.findMany({
		where,
		include: { category: { select: { id: true, name: true } } },
		orderBy: [{ [parsed.sort]: parsed.direction }, { id: 'asc' }],
		skip: (page - 1) * parsed.pageSize,
		take: parsed.pageSize
	})

	return {
		rows: rows.map(toSummary),
		totalCount,
		page,
		pageSize: parsed.pageSize,
		lastPage
	}
}

export async function getProduct(productId: string): Promise<ProductSummary> {
	const actor = await requireActor('masters:read')
	const product = await getPrisma().product.findFirst({
		where: { id: productId, businessId: actor.businessId },
		include: { category: { select: { id: true, name: true } } }
	})

	if (!product) {
		throw new ApplicationError('NOT_FOUND', 'This product does not exist.')
	}

	return toSummary(product)
}

async function assertCategoryUsable(businessId: string, categoryId: string) {
	const category = await getPrisma().productCategory.findFirst({
		where: { id: categoryId, businessId },
		select: { archivedAt: true }
	})

	if (!category) {
		throw new ApplicationError('VALIDATION_ERROR', 'Check the highlighted fields.', {
			categoryId: ['Choose an available category.']
		})
	}

	if (category.archivedAt) {
		throw new ApplicationError('ARCHIVED_DEPENDENCY', 'That category is archived.', {
			categoryId: ['Choose an active category.']
		})
	}
}

export async function createProduct(input: ProductInput) {
	const actor = await requireActor('masters:create')
	const parsed = productInputSchema.parse(input)
	await assertCategoryUsable(actor.businessId, parsed.categoryId)

	return getPrisma().product.create({
		data: { ...parsed, businessId: actor.businessId },
		select: { id: true }
	})
}

export async function updateProduct(productId: string, revision: number, input: ProductInput) {
	const actor = await requireActor('masters:update')
	const parsed = productInputSchema.parse(input)
	await assertCategoryUsable(actor.businessId, parsed.categoryId)
	const prisma = getPrisma()

	const result = await prisma.product.updateMany({
		where: { id: productId, businessId: actor.businessId, revision },
		data: { ...parsed, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		await assertProductExists(prisma, productId, actor.businessId)
		throw new ApplicationError(
			'STALE_REVISION',
			'This product changed while you were editing. Reload it and review the current values.'
		)
	}

	return { id: productId }
}

export async function setProductArchived(productId: string, revision: number, isArchived: boolean) {
	const actor = await requireActor('masters:archive')
	const prisma = getPrisma()

	const result = await prisma.product.updateMany({
		where: { id: productId, businessId: actor.businessId, revision },
		data: { archivedAt: isArchived ? new Date() : null, revision: { increment: 1 } }
	})

	if (result.count === 0) {
		await assertProductExists(prisma, productId, actor.businessId)
		throw new ApplicationError(
			'STALE_REVISION',
			'This product changed while you were viewing it. Reload it and try again.'
		)
	}

	return { id: productId }
}

async function assertProductExists(
	prisma: ReturnType<typeof getPrisma>,
	productId: string,
	businessId: string
) {
	const exists = await prisma.product.findFirst({
		where: { id: productId, businessId },
		select: { id: true }
	})

	if (!exists) {
		throw new ApplicationError('NOT_FOUND', 'This product does not exist.')
	}
}

export async function listSelectableProducts() {
	const actor = await requireActor('masters:read')
	const rows = await getPrisma().product.findMany({
		where: { businessId: actor.businessId, archivedAt: null },
		select: { id: true, name: true, sku: true, purchaseCost: true },
		orderBy: [{ name: 'asc' }, { id: 'asc' }]
	})

	return rows.map((product) => ({
		id: product.id,
		name: product.name,
		sku: product.sku,
		purchaseCost: decimalToString(product.purchaseCost)
	}))
}
