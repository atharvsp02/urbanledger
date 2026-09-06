import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarDate, ToolbarSearch } from '@/components/ui/list-toolbar'
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

			<ListToolbar
				action="/settings/audit"
				searchName="action"
				searchLabel="Action"
				searchPlaceholder="payment.record"
				searchDefaultValue={params.action ?? ''}
				resetHref="/settings/audit"
			>
				<ToolbarSearch
					label="Target type"
					name="targetType"
					placeholder="Payment"
					defaultValue={params.targetType ?? ''}
				/>
				<ToolbarDate label="From" name="from" defaultValue={params.from ?? ''} />
				<ToolbarDate label="To" name="to" defaultValue={params.to ?? ''} />
			</ListToolbar>

			<Suspense fallback={<SkeletonTable rows={6} columns={5} />}>
				<AuditTable params={params} />
			</Suspense>
		</>
	)
}
