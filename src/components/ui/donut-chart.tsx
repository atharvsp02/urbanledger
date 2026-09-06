import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'

const COLORS = [
	'var(--accent)',
	'var(--success)',
	'var(--warning)',
	'var(--danger)',
	'var(--faint-foreground)'
] as const

export type DonutDatum = {
	label: string
	value: number
	valueLabel: string
}

export function DonutChart({
	data,
	centerLabel,
	centerValue,
	className
}: {
	data: readonly DonutDatum[]
	centerLabel: string
	centerValue: string
	className?: string
}) {
	const values = data.map((datum) => (Number.isFinite(datum.value) ? Math.max(0, datum.value) : 0))
	const total = values.reduce((sum, value) => sum + value, 0)
	let offset = 0
	const stops = values.map((value, index) => {
		const start = offset
		offset += total === 0 ? 0 : (value / total) * 100
		return `${COLORS[index % COLORS.length]} ${start}% ${offset}%`
	})
	const background = total === 0 ? 'var(--surface-soft)' : `conic-gradient(${stops.join(', ')})`

	return (
		<div className={cn('grid items-center gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]', className)}>
			<div
				aria-hidden="true"
				className="relative mx-auto grid size-40 place-items-center rounded-full"
				style={{ background } as CSSProperties}
			>
				<div className="grid size-24 place-items-center rounded-full bg-surface text-center shadow-[0_0_0_1px_var(--border)]">
					<div className="px-2">
						<p className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							{centerLabel}
						</p>
						<p className="mt-1 text-sm font-semibold tabular-nums">{centerValue}</p>
					</div>
				</div>
			</div>

			<ul className="flex list-none flex-col gap-2.5 p-0">
				{data.map((datum, index) => (
					<li key={datum.label} className="flex min-w-0 items-center gap-2.5 text-sm">
						<span
							aria-hidden="true"
							className="size-2.5 shrink-0 rounded-full"
							style={{ backgroundColor: COLORS[index % COLORS.length] }}
						/>
						<span className="min-w-0 flex-1 truncate text-muted-foreground">{datum.label}</span>
						<span className="shrink-0 font-medium tabular-nums">{datum.valueLabel}</span>
					</li>
				))}
			</ul>
		</div>
	)
}
