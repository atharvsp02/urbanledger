import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Field, FieldRow } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import type { AuditEventDetail } from '@/lib/contracts/access-administration'
import { formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listAuditEvents } from '@/server/access'

export const metadata: Metadata = { title: 'Audit' }

const PAGE_SIZE = 20

type AuditParams = {
	action?: string
	targetType?: string
	from?: string
	to?: string
	page?: string
}

function buildHref(params: AuditParams, patch: AuditParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/settings/audit' : `/settings/audit?${queryString}`
}

function summarizeDetails(details: unknown) {
	if (details == null) return '-'

	try {
		const text = JSON.stringify(details)
		return text.length > 120 ? `${text.slice(0, 117)}...` : text
	} catch {
		return '-'
	}
}

async function AuditTable({ params }: { params: AuditParams }) {
	const actor = await getActor()
	const result = await listAuditEvents(actor, {
		action: params.action === '' ? undefined : params.action,
		targetType: params.targetType === '' ? undefined : params.targetType,
		dateFrom: params.from === '' ? undefined : params.from,
		dateTo: params.to === '' ? undefined : params.to,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) {
		return result.error.code === 'FORBIDDEN' ? (
			<ForbiddenState description={result.error.message} />
		) : (
			<ErrorState description={result.error.message} />
		)
	}

	const columns: readonly TableColumn<AuditEventDetail>[] = [
		{
			id: 'occurredAt',
			header: 'When',
			cell: (event) => formatBusinessDate(event.occurredAt.slice(0, 10))
		},
		{
			id: 'actor',
			header: 'Actor',
			cell: (event) => event.actor?.displayName ?? 'System'
		},
		{ id: 'action', header: 'Action', cell: (event) => event.action },
		{ id: 'target', header: 'Target', cell: (event) => event.targetType },
		{
			id: 'details',
			header: 'Details',
			cell: (event) => (
				<span className="font-mono text-xs break-all text-muted-foreground">
					{summarizeDetails(event.details)}
				</span>
			)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Audit events"
				columns={columns}
				rows={result.data.rows}
				getRowKey={(event) => event.id}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={ScrollText}
							title="No audit events match these filters"
							description="Business changes are recorded here as they happen."
						/>
					</div>
				}
			/>
			{result.data.rows.length > 0 && (
				<Pagination
					page={result.data.page}
					pageSize={result.data.pageSize}
					totalCount={result.data.totalCount}
					itemNoun="events"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditParams> }) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Audit"
				lead="Recorded business changes. Secrets and credentials are never stored here."
				breadcrumbs={[{ label: 'Settings' }, { label: 'Audit' }]}
			/>

			<form
				method="get"
				action="/settings/audit"
				className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
			>
				<Field id="audit-action" label="Action" className="sm:w-56">
					{(props) => (
						<TextInput
							{...props}
							name="action"
							placeholder="payment.record"
							defaultValue={params.action ?? ''}
						/>
					)}
				</Field>
				<Field id="audit-targetType" label="Target type" className="sm:w-48">
					{(props) => (
						<TextInput
							{...props}
							name="targetType"
							placeholder="Payment"
							defaultValue={params.targetType ?? ''}
						/>
					)}
				</Field>
				<FieldRow className="sm:w-auto sm:grid-cols-2">
					<Field id="audit-from" label="From" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="from" defaultValue={params.from ?? ''} />
						)}
					</Field>
					<Field id="audit-to" label="To" inRow>
						{(props) => (
							<TextInput {...props} type="date" name="to" defaultValue={params.to ?? ''} />
						)}
					</Field>
				</FieldRow>
				<div className="flex flex-wrap gap-2">
					<button type="submit" className={buttonVariants({ size: 'sm' })}>
						Apply
					</button>
					<Link
						href="/settings/audit"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Clear
					</Link>
				</div>
			</form>

			<Suspense
				key={`${params.action}|${params.targetType}|${params.from}|${params.to}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={5} />}
			>
				<AuditTable params={params} />
			</Suspense>
		</>
	)
}
