import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'

export function Pagination({
	page,
	pageSize,
	totalCount,
	buildHref,
	itemNoun = 'records'
}: {
	page: number
	pageSize: number
	totalCount: number
	buildHref: (page: number) => string
	itemNoun?: string
}) {
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize))
	const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
	const lastRow = Math.min(page * pageSize, totalCount)
	const hasPrevious = page > 1
	const hasNext = page < lastPage

	return (
		<nav
			aria-label="Pagination"
			className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5"
		>
			<p className="text-sm text-muted-foreground" role="status">
				{totalCount === 0
					? `No ${itemNoun}`
					: `Showing ${firstRow}-${lastRow} of ${totalCount} ${itemNoun}`}
			</p>

			<div className="flex items-center gap-2">
				<PageLink
					href={buildHref(page - 1)}
					isEnabled={hasPrevious}
					label="Previous page"
					icon={<ChevronLeft aria-hidden="true" className="size-4" />}
					text="Previous"
				/>
				<span className="px-1 text-sm text-muted-foreground">
					Page {page} of {lastPage}
				</span>
				<PageLink
					href={buildHref(page + 1)}
					isEnabled={hasNext}
					label="Next page"
					text="Next"
					icon={<ChevronRight aria-hidden="true" className="size-4" />}
					isTrailingIcon
				/>
			</div>
		</nav>
	)
}

function PageLink({
	href,
	isEnabled,
	label,
	text,
	icon,
	isTrailingIcon = false
}: {
	href: string
	isEnabled: boolean
	label: string
	text: string
	icon: React.ReactNode
	isTrailingIcon?: boolean
}) {
	const className = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-1.5')
	const content = isTrailingIcon ? (
		<>
			{text}
			{icon}
		</>
	) : (
		<>
			{icon}
			{text}
		</>
	)

	// A disabled anchor still links somewhere that does not exist.
	if (!isEnabled) {
		return (
			<span aria-disabled="true" className={cn(className, 'opacity-50')}>
				{content}
			</span>
		)
	}

	return (
		<Link href={href} aria-label={label} className={className}>
			{content}
		</Link>
	)
}
