import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { ErrorState } from '@/components/ui/state-panel'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getProfitAndLoss } from '@/server/reports'
import { ReportSection } from '@/app/(workspace)/reports/report-section'

type ProfitLossParams = { from?: string; to?: string }

function startOfYear(date: string) {
	return `${date.slice(0, 4)}-01-01`
}

export default async function ProfitAndLossPage({
	searchParams
}: {
	searchParams: Promise<ProfitLossParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const today = await getBusinessToday(actor)
	const dateFrom = params.from || startOfYear(today)
	const dateTo = params.to || today
	const result = await getProfitAndLoss(actor, { dateFrom, dateTo })

	return (
		<>
			<PageHeader
				title="Profit and loss"
				lead="Income and expense over an inclusive date range, from posted entries only."
				breadcrumbs={[{ label: 'Reports' }, { label: 'Profit and loss' }]}
			/>

			<form
				method="get"
				action="/reports/profit-loss"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
			>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="pl-from" label="From" isRequired inRow>
						{(props) => <TextInput {...props} type="date" name="from" defaultValue={dateFrom} />}
					</Field>
					<Field id="pl-to" label="To" isRequired inRow>
						{(props) => <TextInput {...props} type="date" name="to" defaultValue={dateTo} />}
					</Field>
				</FieldRow>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<a
						href="/reports/profit-loss"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						This year
					</a>
				</div>
			</form>

			{!result.ok ? (
				<ErrorState description={result.error.message} />
			) : (
				<>
					<p className="text-sm text-muted-foreground">
						{formatBusinessDate(result.data.dateFrom)} to {formatBusinessDate(result.data.dateTo)},
						both days included. Amounts in the business currency.
					</p>

					<div className="grid gap-4 lg:grid-cols-2">
						<ReportSection
							title="Income"
							description="Credit minus debit on income accounts."
							rows={result.data.income.rows}
							total={result.data.income.total}
							totalLabel="Total income"
							emptyDescription="No income account has posted movement in this range."
						/>
						<ReportSection
							title="Expenses"
							description="Debit minus credit on expense accounts."
							rows={result.data.expenses.rows}
							total={result.data.expenses.total}
							totalLabel="Total expenses"
							emptyDescription="No expense account has posted movement in this range."
						/>
					</div>

					<WorkSurface title="Result">
						<dl className="flex flex-col gap-2 text-sm">
							<div className="flex items-baseline justify-between gap-4">
								<dt className="text-muted-foreground">Income</dt>
								<dd className="tabular-nums">{formatAmount(result.data.income.total)}</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4">
								<dt className="text-muted-foreground">Expenses</dt>
								<dd className="tabular-nums">{formatAmount(result.data.expenses.total)}</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
								<dt className="font-semibold">
									{Number(result.data.profit) < 0 ? 'Net loss' : 'Net profit'}
								</dt>
								<dd className="text-lg font-semibold tabular-nums">
									{formatAmount(result.data.profit)}
								</dd>
							</div>
						</dl>
						<p className="mt-3 text-sm text-muted-foreground">
							Receiving a payment settles a receivable; it never records revenue a second time.
						</p>
					</WorkSurface>
				</>
			)}
		</>
	)
}
