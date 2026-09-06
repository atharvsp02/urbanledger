export type TrendPoint = {
	period: string
	revenue: number
	expense: number
	profit: number
	revenueLabel: string
	expenseLabel: string
	profitLabel: string
}

export function TrendColumns({ points }: { points: readonly TrendPoint[] }) {
	const maximum = Math.max(
		1,
		...points.flatMap((point) => [
			Math.abs(point.revenue),
			Math.abs(point.expense),
			Math.abs(point.profit)
		])
	)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
				<Legend tone="bg-accent" label="Revenue" />
				<Legend tone="bg-warning" label="Expense" />
				<Legend tone="bg-success" label="Profit" />
				<Legend tone="bg-danger" label="Loss" />
			</div>
			<div className="flex items-end gap-3 overflow-x-auto pb-1">
				{points.map((point) => (
					<div key={point.period} className="flex min-w-16 flex-1 flex-col items-center gap-2">
						<div className="flex h-36 items-end gap-1">
							<Column
								value={point.revenue}
								maximum={maximum}
								label={`Revenue ${point.revenueLabel}`}
								className="bg-accent"
							/>
							<Column
								value={point.expense}
								maximum={maximum}
								label={`Expense ${point.expenseLabel}`}
								className="bg-warning"
							/>
							<Column
								value={point.profit}
								maximum={maximum}
								label={`Profit ${point.profitLabel}`}
								className={point.profit < 0 ? 'bg-danger' : 'bg-success'}
							/>
						</div>
						<span className="text-[10px] text-muted-foreground">{point.period}</span>
					</div>
				))}
			</div>
		</div>
	)
}

function Legend({ tone, label }: { tone: string; label: string }) {
	return (
		<span className="flex items-center gap-1.5">
			<span aria-hidden="true" className={`size-2.5 rounded-sm ${tone}`} />
			{label}
		</span>
	)
}

function Column({
	value,
	maximum,
	label,
	className
}: {
	value: number
	maximum: number
	label: string
	className: string
}) {
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className={`w-3 rounded-t transition-[height] duration-300 motion-reduce:transition-none ${className}`}
			style={{ height: `${Math.max(2, (Math.abs(value) / maximum) * 100)}%` }}
		/>
	)
}
