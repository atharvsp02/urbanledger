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
import { FixtureNotice } from '@/app/(workspace)/fixture-notice'
import {
	CONTACT_TYPES,
	CONTACT_TYPE_LABELS,
	type Contact,
	type ContactType
} from '@/lib/masters/contact'
import { listContacts } from '@/server/dev-fixtures/contacts'

const PAGE_SIZE = 10

type ContactParams = { q?: string; type?: string; archived?: string; page?: string }

async function ContactsTable({ params }: { params: ContactParams }) {
	const type: ContactType | 'all' = CONTACT_TYPES.includes(params.type as ContactType)
		? (params.type as ContactType)
		: 'all'
	const includeArchived = params.archived === 'include'
	const search = params.q ?? ''

	const result = listContacts({
		search,
		type,
		includeArchived,
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	const buildHref = (patch: ContactParams) => {
		const merged = { ...params, ...patch }
		const query = new URLSearchParams()
		for (const [key, value] of Object.entries(merged)) {
			if (value != null && value !== '') query.set(key, value)
		}
		const queryString = query.toString()
		return queryString === '' ? '/contacts' : `/contacts?${queryString}`
	}

	const columns: readonly TableColumn<Contact>[] = [
		{
			id: 'name',
			header: 'Name',
			cell: (contact) => (
				<span className="flex items-center gap-3">
					<ContactAvatar name={contact.name} className="size-8" />
					<span className="min-w-0">
						<span className="block font-medium">{contact.name}</span>
						<span className="block text-xs text-muted-foreground">{contact.email}</span>
					</span>
				</span>
			)
		},
		{
			id: 'type',
			header: 'Type',
			cell: (contact) => (
				<Badge tone={contact.type === 'vendor' ? 'neutral' : 'accent'}>
					{CONTACT_TYPE_LABELS[contact.type]}
				</Badge>
			)
		},
		{ id: 'mobile', header: 'Mobile', cell: (contact) => contact.mobile },
		{
			id: 'location',
			header: 'Location',
			cell: (contact) => `${contact.city}, ${contact.state}`
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
							title={search === '' ? 'No contacts yet' : 'No contacts match these filters'}
							description={
								search === ''
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
					pageSize={PAGE_SIZE}
					totalCount={result.totalCount}
					itemNoun="contacts"
					buildHref={(page) => buildHref({ page: String(page) })}
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
	const type: ContactType | 'all' = CONTACT_TYPES.includes(params.type as ContactType)
		? (params.type as ContactType)
		: 'all'
	const includeArchived = params.archived === 'include'
	const search = params.q ?? ''

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

			<FixtureNotice master="contacts" />

			<ListToolbar
				action="/contacts"
				searchLabel="Search contacts"
				searchPlaceholder="Name, email or city"
				searchDefaultValue={search}
				resetHref="/contacts"
			>
				<ToolbarFilter
					label="Type"
					name="type"
					defaultValue={type}
					options={[
						{ value: 'all', label: 'All types' },
						...CONTACT_TYPES.map((value) => ({ value, label: CONTACT_TYPE_LABELS[value] }))
					]}
				/>
				<ToolbarFilter
					label="Archived"
					name="archived"
					defaultValue={includeArchived ? 'include' : 'exclude'}
					options={[
						{ value: 'exclude', label: 'Active only' },
						{ value: 'include', label: 'Include archived' }
					]}
				/>
			</ListToolbar>

			<Suspense
				key={`${search}|${type}|${includeArchived}|${params.page ?? '1'}`}
				fallback={<SkeletonTable rows={6} columns={5} />}
			>
				<ContactsTable params={params} />
			</Suspense>
		</>
	)
}
