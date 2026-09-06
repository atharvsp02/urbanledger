import { cn } from '@/lib/cn'

export type BarDatum = { label: string; value: number; tone?: 'accent' | 'success' | 'danger' }

const TONE_CLASS = {
	accent: 'bg-accent',
	success: 'bg-success',
	danger: 'bg-danger'
} as const

export function BarSeries({ data, className }: { data: readonly BarDatum[]; className?: string }) {
	const maximum = Math.max(1, ...data.map((datum) => Math.abs(datum.value)))

	return (
		<ul className={cn('flex list-none flex-col gap-2 p-0', className)}>
			{data.map((datum) => (
				<li key={datum.label} className="grid grid-cols-[7rem_1fr] items-center gap-3">
					<span className="truncate text-xs text-muted-foreground">{datum.label}</span>
					<span className="h-2.5 overflow-hidden rounded bg-surface-soft">
						<span
							className={cn(
								'block h-full rounded transition-[width] duration-300 motion-reduce:transition-none',
								TONE_CLASS[datum.tone ?? 'accent']
							)}
							style={{ width: `${(Math.abs(datum.value) / maximum) * 100}%` }}
						/>
					</span>
				</li>
			))}
		</ul>
	)
}
