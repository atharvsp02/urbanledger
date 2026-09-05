import 'server-only'
import {
	productCategoryInputSchema,
	type ProductCategoryInput,
	type ProductCategorySummary
} from '@/lib/masters/product'
import { requireActor } from '@/server/auth/actor'
import { getPrisma } from '@/server/db/prisma'
import { ApplicationError } from '@/server/errors/application-error'

export async function listProductCategories(options: { includeArchived?: boolean } = {}) {
	const actor = await requireActor('masters:read')
	const rows = await getPrisma().productCategory.findMany({
		where: {
			businessId: actor.businessId,
			...(options.includeArchived === true ? {} : { archivedAt: null })
		},
		include: { _count: { select: { products: true } } },
		orderBy: [{ name: 'asc' }, { id: 'asc' }]
	})

	return rows.map((row): ProductCategorySummary => ({
		id: row.id,
		name: row.name,
		archivedAt: row.archivedAt?.toISOString().slice(0, 10) ?? null,
		productCount: row._count.products
	}))
}

export async function createProductCategory(input: ProductCategoryInput) {
	const actor = await requireActor('masters:create')
	const parsed = productCategoryInputSchema.parse(input)
	const prisma = getPrisma()

	const existing = await prisma.productCategory.findFirst({
		where: { businessId: actor.businessId, name: parsed.name },
		select: { id: true, archivedAt: true }
	})

	if (existing) {
		throw new ApplicationError('CONFLICT', 'A category with this name already exists.', {
			name: ['A category with this name already exists.']
		})
	}

	return prisma.productCategory.create({
		data: { businessId: actor.businessId, name: parsed.name },
		select: { id: true, name: true }
	})
}

export async function setProductCategoryArchived(categoryId: string, isArchived: boolean) {
	const actor = await requireActor('masters:archive')
	const prisma = getPrisma()

	const result = await prisma.productCategory.updateMany({
		where: { id: categoryId, businessId: actor.businessId },
		data: { archivedAt: isArchived ? new Date() : null }
	})

	if (result.count === 0) {
		throw new ApplicationError('NOT_FOUND', 'This category does not exist.')
	}

	return { id: categoryId }
}
