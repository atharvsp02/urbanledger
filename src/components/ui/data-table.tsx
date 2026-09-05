import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ColumnSort = {
	// Where a click goes next; the caller carries the rest of the filter state.
	href: string
	isActive: boolean
	direction: 'asc' | 'desc'
}

export type TableColumn<Row> = {
	id: string
	header: string
	// Amounts and quantities align right in fixed-width figures so digits stack.
	isNumeric?: boolean
	sort?: ColumnSort
	headerClassName?: string
	cellClassName?: string
	cell: (row: Row) => React.ReactNode
}

function SortableHeader({ label, sort }: { label: string; sort: ColumnSort }) {
	const Icon = !sort.isActive ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown

	return (
		<Link
			href={sort.href}
			className={cn(
				'inline-flex min-h-11 items-center gap-1.5 hover:text-foreground',
				sort.isActive && 'text-foreground'
			)}
		>
			{label}
			<Icon aria-hidden="true" className="size-3.5 shrink-0" />
		</Link>
	)
}

export function DataTable<Row>({
	caption,
	isCaptionVisible = false,
	columns,
	rows,
	getRowKey,
	getRowHref,
	emptyState
}: {
	caption: string
	isCaptionVisible?: boolean
	columns: readonly TableColumn<Row>[]
	rows: readonly Row[]
	getRowKey: (row: Row) => string
	// The link lives in the first cell rather than covering the row, so the
	// focus ring lands on something a reader can announce.
	getRowHref?: (row: Row) => string
	emptyState?: React.ReactNode
}) {
	if (rows.length === 0 && emptyState != null) return <>{emptyState}</>

	return (
		<div
			role="region"
			aria-label={caption}
			tabIndex={0}
			className="overflow-x-auto rounded-xl outline-offset-0"
		>
			<table className="w-full min-w-[44rem] border-collapse text-[13px]">
				<caption
					className={cn(
						'text-left',
						isCaptionVisible ? 'px-4 py-3 text-muted-foreground' : 'sr-only'
					)}
				>
					{caption}
				</caption>
				<thead>
					<tr className="border-b border-border-strong">
						{columns.map((column) => (
							<th
								key={column.id}
								scope="col"
								aria-sort={
									column.sort == null
										? undefined
										: !column.sort.isActive
											? 'none'
											: column.sort.direction === 'asc'
												? 'ascending'
												: 'descending'
								}
								className={cn(
									'px-4 pt-1 pb-2 text-[11px] font-semibold tracking-[0.05em] whitespace-nowrap text-muted-foreground uppercase',
									column.isNumeric === true ? 'text-right' : 'text-left',
									column.headerClassName
								)}
							>
								{column.sort == null ? (
									column.header
								) : (
									<SortableHeader label={column.header} sort={column.sort} />
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const href = getRowHref?.(row)

						return (
							<tr
								key={getRowKey(row)}
								className="border-b border-border last:border-b-0 hover:bg-surface-soft"
							>
								{columns.map((column, index) => {
									const content = column.cell(row)

									return (
										<td
											key={column.id}
											className={cn(
												'px-5 py-3.5 align-top',
												column.isNumeric === true ? 'text-right tabular-nums' : 'text-left',
												column.cellClassName
											)}
										>
											{index === 0 && href != null ? (
												<Link href={href} className="font-medium text-accent hover:underline">
													{content}
												</Link>
											) : (
												content
											)}
										</td>
									)
								})}
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}
