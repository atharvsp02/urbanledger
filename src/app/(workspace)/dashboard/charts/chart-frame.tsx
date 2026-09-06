import { WorkSurface } from '@/components/app-shell/page-header'

// Every chart ships with a table of the same numbers, so nothing is readable
// only by eye.
export function ChartFrame({
	title,
	description,
	action,
	chart,
	table
}: {
	title: string
	description?: string
	action?: React.ReactNode
	chart: React.ReactNode
	table: React.ReactNode
}) {
	return (
		<WorkSurface title={title} description={description} action={action}>
			<div className="flex flex-col gap-4">
				<div aria-hidden="true">{chart}</div>
				<details className="group">
					<summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">
						View the numbers
					</summary>
					<div className="mt-3">{table}</div>
				</details>
			</div>
		</WorkSurface>
	)
}
