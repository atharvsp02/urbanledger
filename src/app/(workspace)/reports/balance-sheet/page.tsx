import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { ErrorState } from '@/components/ui/state-panel'
import { formatAmount, formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getBalanceSheet } from '@/server/reports'
import { ReportSection } from '@/app/(workspace)/reports/report-section'

type BalanceSheetParams = { asOf?: string }

export default async function BalanceSheetPage({
	searchParams
}: {
	searchParams: Promise<BalanceSheetParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const today = await getBusinessToday(actor)
	const asOfDate = params.asOf || today
	const result = await getBalanceSheet(actor, { asOfDate })

	return (
		<>
			<PageHeader
				title="Balance sheet"
				lead="What the business owns and owes on a single date, from posted entries only."
				breadcrumbs={[{ label: 'Reports' }, { label: 'Balance sheet' }]}
			/>

			<form
				method="get"
				action="/reports/balance-sheet"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
			>
				<Field id="balance-asOf" label="As of date" className="sm:w-56" isRequired>
					{(props) => <TextInput {...props} type="date" name="asOf" defaultValue={asOfDate} />}
				</Field>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<a
						href="/reports/balance-sheet"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Today
					</a>
				</div>
			</form>

			{!result.ok ? (
				<ErrorState description={result.error.message} />
			) : (
				<>
					<div className="flex flex-wrap items-center gap-3">
						<Badge tone={result.data.balanced ? 'success' : 'danger'}>
							{result.data.balanced ? 'Balanced' : 'Out of balance'}
						</Badge>
						<span className="text-sm text-muted-foreground">
							As of {formatBusinessDate(result.data.asOfDate)}. Amounts in the business currency.
						</span>
					</div>

					<div className="grid gap-4 lg:grid-cols-2">
						<ReportSection
							title="Assets"
							rows={result.data.assets.rows}
							total={result.data.assets.total}
							totalLabel="Total assets"
							emptyDescription="No asset account has posted movement on or before this date."
						/>

						<div className="flex flex-col gap-4">
							<ReportSection
								title="Liabilities"
								rows={result.data.liabilities.rows}
								total={result.data.liabilities.total}
								totalLabel="Total liabilities"
								emptyDescription="No liability account has posted movement on or before this date."
							/>

							<ReportSection
								title="Capital and earnings"
								description="Contributed capital plus earnings derived from posted income and expense."
								rows={result.data.equity.rows}
								total={result.data.equity.total}
								totalLabel="Total capital and earnings"
								emptyDescription="No capital account has posted movement on or before this date."
							>
								<div className="flex items-baseline justify-between gap-4 border-t border-border px-4 py-3">
									<span className="text-sm text-muted-foreground">Derived earnings</span>
									<span className="text-sm tabular-nums">
										{formatAmount(result.data.equity.derivedEarnings)}
									</span>
								</div>
							</ReportSection>
						</div>
					</div>

					<WorkSurface title="Accounting identity">
						<dl className="flex flex-col gap-2 text-sm">
							<div className="flex items-baseline justify-between gap-4">
								<dt className="text-muted-foreground">Total assets</dt>
								<dd className="tabular-nums">{formatAmount(result.data.assets.total)}</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4">
								<dt className="text-muted-foreground">Total liabilities, capital and earnings</dt>
								<dd className="tabular-nums">
									{formatAmount(result.data.totalLiabilitiesAndEquity)}
								</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
								<dt className="font-semibold">Difference</dt>
								<dd className="font-semibold tabular-nums">
									{formatAmount(result.data.difference)}
								</dd>
							</div>
						</dl>
						<p className="mt-3 text-sm text-muted-foreground">
							A debit balance in liabilities or a credit balance in assets keeps its sign here
							rather than being reclassified.
						</p>
					</WorkSurface>
				</>
			)}
		</>
	)
}
