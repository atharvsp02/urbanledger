import { Boxes, Package, Wrench, type LucideIcon } from 'lucide-react'
import { PRODUCT_KIND_LABELS, type ProductKind } from '@/lib/masters/product'
import { cn } from '@/lib/cn'

const PRODUCT_ICONS: Record<ProductKind, LucideIcon> = {
	GOODS: Package,
	SERVICE: Wrench,
	COMBO: Boxes
}

function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	const first = parts[0]?.[0] ?? ''
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
	return `${first}${last}`.toUpperCase()
}

// Dimensions are reserved with or without an image, so lists do not reflow.
export function ContactAvatar({
	name,
	imageUrl,
	className
}: {
	name: string
	imageUrl?: string
	className?: string
}) {
	const shell = cn(
		'grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-border',
		className
	)

	if (imageUrl != null) {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- storage objects are served from a signed URL, not an optimizer route
			<img src={imageUrl} alt="" width={40} height={40} className={cn(shell, 'object-cover')} />
		)
	}

	return (
		<span
			aria-hidden="true"
			className={cn(shell, 'bg-surface-tint text-xs font-semibold text-accent')}
		>
			{initialsOf(name)}
		</span>
	)
}

export function ProductThumbnail({
	kind,
	imageUrl,
	className
}: {
	kind: ProductKind
	imageUrl?: string
	className?: string
}) {
	const Icon = PRODUCT_ICONS[kind]
	const shell = cn(
		'grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border',
		className
	)

	if (imageUrl != null) {
		return (
			// eslint-disable-next-line @next/next/no-img-element -- storage objects are served from a signed URL, not an optimizer route
			<img src={imageUrl} alt="" width={40} height={40} className={cn(shell, 'object-cover')} />
		)
	}

	return (
		<span
			role="img"
			aria-label={`${PRODUCT_KIND_LABELS[kind]} placeholder`}
			className={cn(shell, 'bg-surface-soft text-muted-foreground')}
		>
			<Icon aria-hidden="true" className="size-5" />
		</span>
	)
}
