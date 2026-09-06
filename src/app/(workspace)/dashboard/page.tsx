import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, LineChart, Wallet } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { SelectInput, TextInput } from '@/components/ui/inputs'
import { SkeletonCard } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { AgingRow, SalesPerformance } from '@/lib/contracts/reports'
import { formatAmount, formatBusinessDate, formatQuantity } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import {
	getBudgetPerformance,
	getDashboardSummary,
	getLiquidityMovement,
	getPayableAging,
	getReceivableAging,
	getSalesPerformance
} from '@/server/reports'
import { ChartFrame } from '@/app/(workspace)/dashboard/charts/chart-frame'
import { BarSeries } from '@/app/(workspace)/dashboard/charts/bar-series'
import { TrendColumns } from '@/app/(workspace)/dashboard/charts/trend-columns'

type DashboardParams = { asOf?: string; from?: string; dimension?: string }

const AGING_LABELS: Record<AgingRow['bucket'], string> = {
	CURRENT: 'Not due',
	'1_30': '1 to 30 days',
	'31_60': '31 to 60 days',
	'61_90': '61 to 90 days',
	'90_PLUS': 'Over 90 days'
}

const DIMENSION_LABELS: Record<SalesPerformance['dimension'], string> = {
	PRODUCT: 'Product',
	CATEGORY: 'Category',
	CUSTOMER: 'Customer'
}

function monthsBefore(date: string, months: number) {
	const [year, month, day] = date.split('-').map(Number)
	const shifted = new Date(Date.UTC(year, month - 1 - months, day))
	return shifted.toISOString().slice(0, 10)
}

function KpiCard({
	label,
	value,
	hint,
	href
}: {
	label: string
	value: string
	hint?: string
	href?: string
}) {
	const body = (
		<>
			<p className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
				{label}
			</p>
			<p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
			{hint != null && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
		</>
	)

	return href == null ? (
		<div className="rounded-xl border border-border bg-surface p-4">{body}</div>
	) : (
		<Link
			href={href}
			className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover motion-reduce:transition-none"
		>
			{body}
		</Link>
	)
}

async function DashboardBody({ params }: { params: DashboardParams }) {
	const actor = await getActor()
	const today = await getBusinessToday(actor)
	const asOfDate = params.asOf || today
	const trendFrom = params.from || monthsBefore(asOfDate, 5)
	const dimension = (['PRODUCT', 'CATEGORY', 'CUSTOMER'] as const).includes(
		params.dimension as SalesPerformance['dimension']
	)
		? (params.dimension as SalesPerformance['dimension'])
		: 'PRODUCT'

	const [summary, receivable, payable, liquidity, budget, sales] = await Promise.all([
		getDashboardSummary(actor, { asOfDate, trendFrom }),
		getReceivableAging(actor, { asOfDate }),
		getPayableAging(actor, { asOfDate }),
		getLiquidityMovement(actor, { dateFrom: trendFrom, dateTo: asOfDate }),
		getBudgetPerformance(actor, { dateFrom: trendFrom, dateTo: asOfDate }),
		getSalesPerformance(actor, { dateFrom: trendFrom, dateTo: asOfDate, dimension })
	])

	if (!summary.ok) return <ErrorState description={summary.error.message} />

	const overdueInvoices = receivable.ok
		? receivable.data.rows.filter((row) => row.bucket !== 'CURRENT').length
		: 0
	const overdueBills = payable.ok
		? payable.data.rows.filter((row) => row.bucket !== 'CURRENT').length
		: 0

	const agingColumns: readonly TableColumn<AgingRow>[] = [
		{ id: 'document', header: 'Document', cell: (row) => row.documentNumber },
		{ id: 'contact', header: 'Contact', cell: (row) => row.contactName },
		{ id: 'dueDate', header: 'Due', cell: (row) => formatBusinessDate(row.dueDate) },
		{ id: 'bucket', header: 'Age', cell: (row) => AGING_LABELS[row.bucket] },
		{
			id: 'outstanding',
			header: 'Outstanding',
			isNumeric: true,
			cell: (row) => formatAmount(row.outstandingAmount)
		}
	]

	return (
		<>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<KpiCard
					label="Bank and cash"
					value={formatAmount(summary.data.liquidityBalance)}
					hint={`As of ${formatBusinessDate(summary.data.asOfDate)}`}
					href="/reports/balance-sheet"
				/>
				<KpiCard
					label="Receivable outstanding"
					value={formatAmount(summary.data.receivableOutstanding)}
					hint={`${summary.data.openCustomerInvoices} open invoices`}
					href="/sales/invoices?state=POSTED"
				/>
				<KpiCard
					label="Payable outstanding"
					value={formatAmount(summary.data.payableOutstanding)}
					hint={`${summary.data.openVendorBills} open bills`}
					href="/purchases/bills?state=POSTED"
				/>
				<KpiCard
					label="Net profit"
					value={formatAmount(summary.data.periodProfit)}
					hint="Selected period"
					href="/reports/profit-loss"
				/>
				<KpiCard
					label="Revenue"
					value={formatAmount(summary.data.periodRevenue)}
					hint="Selected period"
					href="/reports/profit-loss"
				/>
				<KpiCard
					label="Expense"
					value={formatAmount(summary.data.periodExpense)}
					hint="Selected period"
					href="/reports/profit-loss"
				/>
				<KpiCard
					label="Overdue documents"
					value={`${overdueInvoices + overdueBills}`}
					hint={`${overdueInvoices} invoices, ${overdueBills} bills`}
				/>
				<KpiCard
					label="Active budgets"
					value={`${summary.data.activeBudgets}`}
					hint="Plans in force"
					href="/budgets"
				/>
			</div>

			<ChartFrame
				title="Revenue, expense and profit"
				description="Posted income and expense per period."
				action={
					<Link
						href="/reports/profit-loss"
						className={buttonVariants({ variant: 'ghost', size: 'sm' })}
					>
						Profit and loss
						<ArrowRight aria-hidden="true" className="size-4" />
					</Link>
				}
				chart={
					summary.data.trend.length === 0 ? (
						<EmptyState
							icon={LineChart}
							title="No posted activity in this range"
							description="Post an invoice or bill to see the trend."
						/>
					) : (
						<TrendColumns
							points={summary.data.trend.map((row) => ({
								period: row.period,
								revenue: Number(row.revenue),
								expense: Number(row.expense),
								profit: Number(row.profit)
							}))}
						/>
					)
				}
				table={
					<DataTable
						caption="Revenue, expense and profit by period"
						columns={[
							{ id: 'period', header: 'Period', cell: (row) => row.period },
							{
								id: 'revenue',
								header: 'Revenue',
								isNumeric: true,
								cell: (row) => formatAmount(row.revenue)
							},
							{
								id: 'expense',
								header: 'Expense',
								isNumeric: true,
								cell: (row) => formatAmount(row.expense)
							},
							{
								id: 'profit',
								header: 'Profit',
								isNumeric: true,
								cell: (row) => formatAmount(row.profit)
							}
						]}
						rows={summary.data.trend}
						getRowKey={(row) => row.period}
					/>
				}
			/>

			<div className="grid gap-4 xl:grid-cols-2">
				<ChartFrame
					title="Cash and bank movement"
					description="Inflow and outflow per liquidity account."
					chart={
						!liquidity.ok || liquidity.data.rows.length === 0 ? (
							<EmptyState
								icon={Wallet}
								title="No liquidity movement"
								description="Record a payment to see cash and bank movement."
							/>
						) : (
							<BarSeries
								data={liquidity.data.rows.flatMap((row) => [
									{ label: `${row.accountCode} in`, value: Number(row.inflow), tone: 'success' },
									{ label: `${row.accountCode} out`, value: Number(row.outflow), tone: 'danger' }
								])}
							/>
						)
					}
					table={
						liquidity.ok ? (
							<DataTable
								caption="Liquidity movement by account"
								columns={[
									{ id: 'account', header: 'Account', cell: (row) => row.accountName },
									{
										id: 'opening',
										header: 'Opening',
										isNumeric: true,
										cell: (row) => formatAmount(row.openingBalance)
									},
									{
										id: 'inflow',
										header: 'Inflow',
										isNumeric: true,
										cell: (row) => formatAmount(row.inflow)
									},
									{
										id: 'outflow',
										header: 'Outflow',
										isNumeric: true,
										cell: (row) => formatAmount(row.outflow)
									},
									{
										id: 'closing',
										header: 'Closing',
										isNumeric: true,
										cell: (row) => formatAmount(row.closingBalance)
									}
								]}
								rows={liquidity.data.rows}
								getRowKey={(row) => row.accountId}
							/>
						) : (
							<ErrorState description={liquidity.error.message} />
						)
					}
				/>

				<ChartFrame
					title="Budget performance"
					description="Planned against actual for analytic accounts in this range."
					action={
						<Link
							href="/reports/budget"
							className={buttonVariants({ variant: 'ghost', size: 'sm' })}
						>
							Budget report
							<ArrowRight aria-hidden="true" className="size-4" />
						</Link>
					}
					chart={
						!budget.ok || budget.data.rows.length === 0 ? (
							<EmptyState
								title="No budget activity"
								description="Create a budget with analytic lines to compare plan and actual."
							/>
						) : (
							<BarSeries
								data={budget.data.rows.slice(0, 8).flatMap((row) => [
									{
										label: `${row.analyticAccountName} plan`,
										value: Number(row.plannedAmount),
										tone: 'accent' as const
									},
									{
										label: `${row.analyticAccountName} actual`,
										value: Number(row.actualAmount),
										tone: 'success' as const
									}
								])}
							/>
						)
					}
					table={
						budget.ok ? (
							<DataTable
								caption="Budget planned against actual"
								columns={[
									{ id: 'budget', header: 'Budget', cell: (row) => row.budgetName },
									{
										id: 'analytic',
										header: 'Analytic account',
										cell: (row) => row.analyticAccountName
									},
									{
										id: 'planned',
										header: 'Planned',
										isNumeric: true,
										cell: (row) => formatAmount(row.plannedAmount)
									},
									{
										id: 'actual',
										header: 'Actual',
										isNumeric: true,
										cell: (row) => formatAmount(row.actualAmount)
									},
									{
										id: 'variance',
										header: 'Variance',
										isNumeric: true,
										cell: (row) => formatAmount(row.variance)
									},
									{
										id: 'utilization',
										header: 'Utilization',
										isNumeric: true,
										cell: (row) =>
											row.utilizationPercent == null ? 'No plan' : `${row.utilizationPercent}%`
									}
								]}
								rows={budget.data.rows}
								getRowKey={(row) => `${row.budgetId}:${row.analyticAccountId}`}
							/>
						) : (
							<ErrorState description={budget.error.message} />
						)
					}
				/>
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<ChartFrame
					title="Receivable aging"
					description="Outstanding customer invoices by age."
					chart={
						!receivable.ok ? (
							<ErrorState description={receivable.error.message} />
						) : (
							<BarSeries
								data={(Object.keys(AGING_LABELS) as AgingRow['bucket'][]).map((bucket) => ({
									label: AGING_LABELS[bucket],
									value: Number(receivable.data.buckets[bucket]),
									tone: bucket === 'CURRENT' ? 'accent' : 'danger'
								}))}
							/>
						)
					}
					table={
						receivable.ok ? (
							<DataTable
								caption="Outstanding customer invoices"
								columns={agingColumns}
								rows={receivable.data.rows}
								getRowKey={(row) => row.documentId}
								getRowHref={(row) => `/sales/invoices/${row.documentId}`}
								emptyState={
									<div className="p-5">
										<EmptyState
											title="Nothing outstanding"
											description="Every posted customer invoice is settled."
										/>
									</div>
								}
							/>
						) : null
					}
				/>

				<ChartFrame
					title="Payable aging"
					description="Outstanding vendor bills by age."
					chart={
						!payable.ok ? (
							<ErrorState description={payable.error.message} />
						) : (
							<BarSeries
								data={(Object.keys(AGING_LABELS) as AgingRow['bucket'][]).map((bucket) => ({
									label: AGING_LABELS[bucket],
									value: Number(payable.data.buckets[bucket]),
									tone: bucket === 'CURRENT' ? 'accent' : 'danger'
								}))}
							/>
						)
					}
					table={
						payable.ok ? (
							<DataTable
								caption="Outstanding vendor bills"
								columns={agingColumns}
								rows={payable.data.rows}
								getRowKey={(row) => row.documentId}
								getRowHref={(row) => `/purchases/bills/${row.documentId}`}
								emptyState={
									<div className="p-5">
										<EmptyState
											title="Nothing outstanding"
											description="Every posted vendor bill is settled."
										/>
									</div>
								}
							/>
						) : null
					}
				/>
			</div>

			<ChartFrame
				title={`Sales by ${DIMENSION_LABELS[dimension].toLowerCase()}`}
				description="Net sales from posted customer invoices in this range."
				chart={
					!sales.ok || sales.data.rows.length === 0 ? (
						<EmptyState
							title="No posted sales in this range"
							description="Post a customer invoice to see sales performance."
						/>
					) : (
						<BarSeries
							data={sales.data.rows.slice(0, 10).map((row) => ({
								label: row.label,
								value: Number(row.netSales)
							}))}
						/>
					)
				}
				table={
					sales.ok ? (
						<DataTable
							caption={`Net sales by ${DIMENSION_LABELS[dimension].toLowerCase()}`}
							columns={[
								{ id: 'label', header: DIMENSION_LABELS[dimension], cell: (row) => row.label },
								{
									id: 'quantity',
									header: 'Quantity',
									isNumeric: true,
									cell: (row) => formatQuantity(row.quantity)
								},
								{
									id: 'documents',
									header: 'Invoices',
									isNumeric: true,
									cell: (row) => row.documentCount
								},
								{
									id: 'netSales',
									header: 'Net sales',
									isNumeric: true,
									cell: (row) => formatAmount(row.netSales)
								}
							]}
							rows={sales.data.rows}
							getRowKey={(row) => row.id}
						/>
					) : (
						<ErrorState description={sales.error.message} />
					)
				}
			/>

			{(overdueInvoices > 0 || overdueBills > 0) && (
				<WorkSurface title="Needs attention">
					<div className="flex flex-wrap items-center gap-3">
						<Badge tone="danger" icon={AlertTriangle}>
							{overdueInvoices + overdueBills} overdue documents
						</Badge>
						<Link
							href="/sales/invoices?state=POSTED"
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Review invoices
						</Link>
						<Link
							href="/purchases/bills?state=POSTED"
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Review bills
						</Link>
					</div>
				</WorkSurface>
			)}
		</>
	)
}

export default async function DashboardPage({
	searchParams
}: {
	searchParams: Promise<DashboardParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const today = await getBusinessToday(actor)

	return (
		<>
			<PageHeader
				title="Dashboard"
				lead={`Financial position and activity for ${actor.displayName}.`}
			/>

			<form
				method="get"
				action="/dashboard"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
			>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="dashboard-from" label="Activity from" inRow>
						{(props) => (
							<TextInput
								{...props}
								type="date"
								name="from"
								defaultValue={params.from ?? monthsBefore(params.asOf || today, 5)}
							/>
						)}
					</Field>
					<Field id="dashboard-asOf" label="As of" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="asOf" defaultValue={params.asOf ?? today} />
						)}
					</Field>
				</FieldRow>
				<Field id="dashboard-dimension" label="Sales grouped by" className="sm:w-48">
					{(props) => (
						<SelectInput {...props} name="dimension" defaultValue={params.dimension ?? 'PRODUCT'}>
							<option value="PRODUCT">Product</option>
							<option value="CATEGORY">Category</option>
							<option value="CUSTOMER">Customer</option>
						</SelectInput>
					)}
				</Field>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<Link href="/dashboard" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
						Reset
					</Link>
				</div>
			</form>

			<Suspense
				key={`${params.asOf}|${params.from}|${params.dimension}`}
				fallback={
					<div className="grid gap-4">
						<SkeletonCard rows={4} />
						<SkeletonCard rows={5} />
					</div>
				}
			>
				<DashboardBody params={params} />
			</Suspense>
		</>
	)
}
