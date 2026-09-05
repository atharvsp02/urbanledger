import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ProductThumbnail } from '@/components/ui/placeholder'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { PRODUCT_KIND_LABELS } from '@/lib/masters/product'
import { getProduct } from '@/server/dev-fixtures/products'
import { ArchiveControl } from '@/app/(workspace)/products/[id]/archive-control'
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const product = getProduct(id)
	if (product == null) notFound()

	return (
		<>
			<PageHeader
				title={product.name}
				breadcrumbs={[{ label: 'Products', href: '/products' }, { label: product.name }]}
				action={
					<>
						<Link
							href={`/products/${product.id}/edit`}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Edit
						</Link>
						<ArchiveControl
							productId={product.id}
							productName={product.name}
							isArchived={product.archivedAt != null}
						/>
					</>
				}
			/>

			<FixtureNotice master="products" />

			<div className="flex flex-wrap items-center gap-3">
				<ProductThumbnail kind={product.kind} />
				<Badge>{PRODUCT_KIND_LABELS[product.kind]}</Badge>
				<Badge tone="accent">{product.category}</Badge>
				{product.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived on {formatBusinessDate(product.archivedAt)}</Badge>
				)}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<WorkSurface title="Sales price">
					<p className="text-2xl font-semibold tabular-nums">{formatAmount(product.salesPrice)}</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Tax-exclusive price used on sales documents.
					</p>
				</WorkSurface>
				<WorkSurface title="Purchase cost">
					<p className="text-2xl font-semibold tabular-nums">
						{formatAmount(product.purchaseCost)}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Tax-exclusive cost used on purchase documents.
					</p>
				</WorkSurface>
			</div>
		</>
	)
}
