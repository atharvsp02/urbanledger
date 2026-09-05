import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export type Breadcrumb = { label: string; href?: string }

export function PageHeader({
	title,
	lead,
	breadcrumbs,
	action
}: {
	title: string
	lead?: string
	breadcrumbs?: readonly Breadcrumb[]
	action?: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-4">
			{breadcrumbs != null && breadcrumbs.length > 0 && (
				<nav aria-label="Breadcrumb">
					<ol className="flex list-none flex-wrap items-center gap-1 p-0 text-sm text-muted-foreground">
						{breadcrumbs.map((crumb, index) => (
							<li key={crumb.label} className="flex items-center gap-1">
								{index > 0 && (
									<ChevronRight aria-hidden="true" className="size-3.5 text-faint-foreground" />
								)}
								{crumb.href == null ? (
									<span aria-current="page">{crumb.label}</span>
								) : (
									<Link href={crumb.href} className="hover:text-foreground hover:underline">
										{crumb.label}
									</Link>
								)}
							</li>
						))}
					</ol>
				</nav>
			)}

			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
				<div className="min-w-0">
					<h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
						{title}
					</h1>
					{lead != null && (
						<p className="mt-2 max-w-[60ch] text-base leading-relaxed text-muted-foreground text-pretty">
							{lead}
						</p>
					)}
				</div>
				{action != null && <div className="flex shrink-0 flex-wrap gap-3">{action}</div>}
			</div>
		</div>
	)
}

export function WorkSurface({
	title,
	description,
	action,
	isFlush = false,
	className,
	children
}: {
	title: string
	description?: string
	action?: React.ReactNode
	isFlush?: boolean
	className?: string
	children: React.ReactNode
}) {
	return (
		<section className={cn('rounded-xl border border-border bg-surface', className)}>
			<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
				<div className="min-w-0">
					<h2 className="text-[15px] leading-tight font-semibold tracking-tight">{title}</h2>
					{description != null && (
						<p className="mt-1 text-sm text-muted-foreground">{description}</p>
					)}
				</div>
				{action != null && <div className="shrink-0">{action}</div>}
			</div>
			<div className={cn(isFlush ? '' : 'p-5')}>{children}</div>
		</section>
	)
}
