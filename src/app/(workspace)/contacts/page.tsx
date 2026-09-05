import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ListToolbar, ToolbarFilter } from '@/components/ui/list-toolbar'
import { Pagination } from '@/components/ui/pagination'
import { ContactAvatar } from '@/components/ui/placeholder'
import { SkeletonTable } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/state-panel'
import {
	contactKinds,
	contactSortColumns,
	CONTACT_KIND_LABELS,
	CONTACT_SORT_LABELS,
	type ContactSummary
} from '@/lib/masters/contact'
import { listContacts } from '@/server/masters/contacts'
import { PortalStateBadge } from '@/app/(workspace)/contacts/portal-state-badge'

const PAGE_SIZE = 20

type ContactParams = {
	q?: string
	kind?: string
	archived?: string
	sort?: string
	dir?: string
	page?: string
}

function buildHref(params: ContactParams, patch: ContactParams) {
	const merged = { ...params, ...patch }
	const query = new URLSearchParams()

	for (const [key, value] of Object.entries(merged)) {
		if (value != null && value !== '') query.set(key, value)
	}

	const queryString = query.toString()
	return queryString === '' ? '/contacts' : `/contacts?${queryString}`
}

async function ContactsTable({ params }: { params: ContactParams }) {
	const result = await listContacts({
		search: params.q ?? '',
		kind: (params.kind as 'ALL') ?? 'ALL',
		includeArchived: params.archived === 'include',
		sort: params.sort as 'name',
		direction: params.dir === 'desc' ? 'desc' : 'asc',
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const columns: readonly TableColumn<ContactSummary>[] = [
		{
			id: 'name',
			header: 'Name',
			cell: (contact) => (
				<span className="flex items-center gap-3">
					<ContactAvatar name={contact.name} className="size-8" />
					<span className="min-w-0">
						<span className="block font-medium">{contact.name}</span>
						<span className="block text-xs text-muted-foreground">{contact.email ?? '-'}</span>
					</span>
				</span>
			)
		},
		{
			id: 'kind',
			header: 'Type',
			cell: (contact) => (
				<Badge tone={contact.kind === 'VENDOR' ? 'neutral' : 'accent'}>
					{CONTACT_KIND_LABELS[contact.kind]}
				</Badge>
			)
		},
		{ id: 'mobile', header: 'Mobile', cell: (contact) => contact.mobile ?? '-' },
		{
			id: 'location',
			header: 'Location',
			cell: (contact) => [contact.city, contact.state].filter(Boolean).join(', ') || '-'
		},
		{
			id: 'portal',
			header: 'Portal',
			cell: (contact) => <PortalStateBadge state={contact.portalState} />
		},
		{
			id: 'status',
			header: 'Status',
			cell: (contact) =>
				contact.archivedAt == null ? (
					<Badge tone="success">Active</Badge>
				) : (
					<Badge tone="warning">Archived</Badge>
				)
		}
	]

	return (
		<div className="rounded-xl border border-border bg-surface">
			<DataTable
				caption="Contacts"
				columns={columns}
				rows={result.rows}
				getRowKey={(contact) => contact.id}
				getRowHref={(contact) => `/contacts/${contact.id}`}
				emptyState={
					<div className="p-5">
						<EmptyState
							icon={Users}
							title={
								(params.q ?? '') === '' ? 'No contacts yet' : 'No contacts match these filters'
							}
							description={
								(params.q ?? '') === ''
									? 'Add a customer or vendor to start recording orders against it.'
									: 'Clear the search or choose a different type.'
							}
						>
							<Link href="/contacts/new" className={buttonVariants({ size: 'sm' })}>
								New contact
							</Link>
						</EmptyState>
					</div>
				}
			/>
			{result.rows.length > 0 && (
				<Pagination
					page={result.page}
					pageSize={result.pageSize}
					totalCount={result.totalCount}
					itemNoun="contacts"
					buildHref={(page) => buildHref(params, { page: String(page) })}
				/>
			)}
		</div>
	)
}

export default async function ContactsPage({
	searchParams
}: {
	searchParams: Promise<ContactParams>
}) {
	const params = await searchParams

	return (
		<>
			<PageHeader
				title="Contacts"
				lead="Customers and vendors used across sales, purchases and payments."
				action={
					<Link href="/contacts/new" className={buttonVariants({ size: 'sm' })}>
						<Plus aria-hidden="true" className="size-4" />
						New contact
					</Link>
				}
			/>

			<ListToolbar
				action="/contacts"
				searchLabel="Search contacts"
				searchPlaceholder="Name, email or city"
				searchDefaultValue={params.q ?? ''}
				resetHref="/contacts"
			>
				<ToolbarFilter
					label="Type"
					name="kind"
					defaultValue={params.kind ?? 'ALL'}
					options={[
						{ value: 'ALL', label: 'All types' },
						...contactKinds.map((value) => ({ value, label: CONTACT_KIND_LABELS[value] }))
					]}
				/>
				<ToolbarFilter
					label="Archived"
					name="archived"
					defaultValue={params.archived === 'include' ? 'include' : 'exclude'}
					options={[
						{ value: 'exclude', label: 'Active only' },
						{ value: 'include', label: 'Include archived' }
					]}
				/>
				<ToolbarFilter
					label="Sort by"
					name="sort"
					defaultValue={params.sort ?? 'name'}
					options={contactSortColumns.map((value) => ({
						value,
						label: CONTACT_SORT_LABELS[value]
					}))}
				/>
				<ToolbarFilter
					label="Order"
					name="dir"
					defaultValue={params.dir === 'desc' ? 'desc' : 'asc'}
					options={[
						{ value: 'asc', label: 'Ascending' },
						{ value: 'desc', label: 'Descending' }
					]}
				/>
			</ListToolbar>

			<Suspense
				key={`${params.q}|${params.kind}|${params.archived}|${params.sort}|${params.dir}|${params.page}`}
				fallback={<SkeletonTable rows={6} columns={6} />}
			>
				<ContactsTable params={params} />
			</Suspense>
		</>
	)
}
