export type TrendPoint = { period: string; revenue: number; expense: number; profit: number }

// A compact column pair per period. Exact values live in the paired table.
export function TrendColumns({ points }: { points: readonly TrendPoint[] }) {
	const maximum = Math.max(
		1,
		...points.flatMap((point) => [Math.abs(point.revenue), Math.abs(point.expense)])
	)

	return (
		<div className="flex items-end gap-3 overflow-x-auto pb-1">
			{points.map((point) => (
				<div key={point.period} className="flex min-w-14 flex-1 flex-col items-center gap-2">
					<div className="flex h-32 items-end gap-1">
						<span
							className="w-3 rounded-t bg-success transition-[height] duration-300 motion-reduce:transition-none"
							style={{ height: `${Math.max(2, (point.revenue / maximum) * 100)}%` }}
						/>
						<span
							className="w-3 rounded-t bg-danger transition-[height] duration-300 motion-reduce:transition-none"
							style={{ height: `${Math.max(2, (point.expense / maximum) * 100)}%` }}
						/>
					</div>
					<span className="text-[10px] text-muted-foreground">{point.period}</span>
				</div>
			))}
		</div>
	)
}
