import Link from 'next/link'
import { cn } from '@/lib/cn'

export function BrandMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn('size-7', className)}>
			<rect width="32" height="32" rx="8" fill="var(--accent)" />
			<path
				d="M10 9h12M10 16h12M10 23h8"
				stroke="var(--accent-foreground)"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	)
}

export function Brand({ homeHref, productLabel }: { homeHref: string; productLabel: string }) {
	return (
		<Link
			href={homeHref}
			className="inline-flex min-h-11 items-center gap-2.5 text-foreground"
			aria-label={`UrbanLedger ${productLabel}`}
		>
			<BrandMark className="size-6 shrink-0" />
			<span className="text-[15px] font-semibold tracking-tight">UrbanLedger</span>
			<span aria-hidden="true" className="h-4 w-px bg-border" />
			<span className="truncate text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
				{productLabel}
			</span>
		</Link>
	)
}
