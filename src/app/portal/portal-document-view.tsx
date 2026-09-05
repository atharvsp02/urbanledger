import Link from 'next/link'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import type { PortalDocumentDetail, PortalDocumentLine } from '@/lib/contracts/portal'
import { formatAmount, formatBusinessDate, formatQuantity, trimMoneyScale } from '@/lib/format'
import { PortalStatusBadge } from '@/app/portal/portal-presentation'

const columns: readonly TableColumn<PortalDocumentLine>[] = [
	{ id: 'product', header: 'Item', cell: (line) => line.productName },
	{
		id: 'quantity',
		header: 'Quantity',
		isNumeric: true,
		cell: (line) => formatQuantity(line.quantity)
	},
	{
		id: 'unitPrice',
		header: 'Unit price',
		isNumeric: true,
		cell: (line) => formatAmount(trimMoneyScale(line.unitPrice))
	},
	{ id: 'net', header: 'Net', isNumeric: true, cell: (line) => formatAmount(line.netTotal) },
	{
		id: 'tax',
		header: 'Tax',
		cell: (line) =>
			line.taxName == null ? (
				<span className="text-muted-foreground">None</span>
			) : (
				`${line.taxName}${line.taxRate == null ? '' : ` (${trimMoneyScale(line.taxRate, 0)}%)`}`
			)
	},
	{
		id: 'taxAmount',
		header: 'Tax amount',
		isNumeric: true,
		cell: (line) => formatAmount(line.taxAmount)
	},
	{ id: 'total', header: 'Total', isNumeric: true, cell: (line) => formatAmount(line.total) }
]

export function PortalDocumentView({
	document,
	title,
	backLabel,
	pdfHref,
	children
}: {
	document: PortalDocumentDetail
	title: string
	backLabel: string
	pdfHref?: string
	children?: React.ReactNode
}) {
	return (
		<>
			<PageHeader
				title={document.number}
				lead={title}
				breadcrumbs={[{ label: backLabel, href: '/portal' }, { label: document.number }]}
				action={
					pdfHref == null ? null : (
						<Link href={pdfHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
							Download PDF
						</Link>
					)
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<PortalStatusBadge status={document.status} overdueAmount={document.overdueAmount} />
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
				<WorkSurface title="Details">
					<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Document date
							</dt>
							<dd className="mt-0.5 text-sm">{formatBusinessDate(document.documentDate)}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Due date
							</dt>
							<dd className="mt-0.5 text-sm">{formatBusinessDate(document.dueDate)}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Reference
							</dt>
							<dd className="mt-0.5 text-sm">{document.reference ?? '-'}</dd>
						</div>
						<div>
							<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
								Order
							</dt>
							<dd className="mt-0.5 text-sm">{document.sourceOrder.number}</dd>
						</div>
					</dl>
				</WorkSurface>

				<WorkSurface title="Amounts">
					<dl className="flex flex-col gap-2 text-sm">
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Net</dt>
							<dd className="tabular-nums">{formatAmount(document.netTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Tax</dt>
							<dd className="tabular-nums">{formatAmount(document.taxTotal)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
							<dt className="font-semibold">Total</dt>
							<dd className="text-lg font-semibold tabular-nums">{formatAmount(document.total)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Paid</dt>
							<dd className="tabular-nums">{formatAmount(document.paidAmount)}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-4">
							<dt className="font-semibold">Outstanding</dt>
							<dd className="font-semibold tabular-nums">
								{formatAmount(document.outstandingAmount)}
							</dd>
						</div>
					</dl>
				</WorkSurface>
			</div>

			{children}

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Document lines"
					columns={columns}
					rows={document.lines}
					getRowKey={(line) => line.id}
				/>
			</div>
		</>
	)
}
