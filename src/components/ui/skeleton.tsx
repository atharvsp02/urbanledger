import { cn } from '@/lib/cn'

export function Skeleton({ className, delayMs }: { className?: string; delayMs?: number }) {
	return (
		<div
			className={cn('animate-pulse rounded bg-surface-tint motion-reduce:animate-none', className)}
			style={delayMs == null ? undefined : { animationDelay: `${delayMs}ms` }}
		/>
	)
}

// The announcement sits outside the busy subtree, which aria-busy defers.
export function LoadingRegion({
	label = 'Loading this section.',
	className,
	children
}: {
	label?: string
	className?: string
	children: React.ReactNode
}) {
	return (
		<>
			<p role="status" className="sr-only">
				{label}
			</p>
			<div aria-busy="true" className={cn('flex flex-col gap-6', className)}>
				{children}
			</div>
		</>
	)
}

export function SkeletonPageHeader({ hasAction = false }: { hasAction?: boolean }) {
	return (
		<div className="flex items-start justify-between gap-8">
			<div className="flex min-w-0 flex-col gap-3">
				<Skeleton className="h-8 w-48 max-w-full sm:h-9" />
				<Skeleton className="h-5 w-72 max-w-full" />
			</div>
			{hasAction && <Skeleton className="h-11 w-32 shrink-0 rounded-lg" />}
		</div>
	)
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
	return (
		<div className={cn('rounded-xl border border-border bg-surface', className)}>
			<div className="border-b border-border px-5 py-4">
				<Skeleton className="h-5 w-32" />
			</div>
			<div className="flex flex-col gap-3 p-5">
				{Array.from({ length: rows }, (_, index) => (
					<Skeleton key={index} className="h-11" delayMs={index * 120} />
				))}
			</div>
		</div>
	)
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
	return (
		<div className="rounded-xl border border-border bg-surface">
			<div className="border-b border-border px-5 py-4">
				<Skeleton className="h-5 w-40" />
			</div>
			<div className="flex flex-col">
				{Array.from({ length: rows }, (_, rowIndex) => (
					<div
						key={rowIndex}
						className="grid gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
						style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
					>
						{Array.from({ length: columns }, (_, columnIndex) => (
							<Skeleton key={columnIndex} className="h-5" delayMs={rowIndex * 90} />
						))}
					</div>
				))}
			</div>
		</div>
	)
}
