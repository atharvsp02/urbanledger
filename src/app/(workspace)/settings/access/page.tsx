import Link from 'next/link'
import type { Metadata } from 'next'
import { Plus, Users } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { EmptyState, ErrorState } from '@/components/ui/state-panel'
import type { AccessUser } from '@/lib/contracts/access-administration'
import { formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { listAccessUsers } from '@/server/access'
import {
	GrantControl,
	IdentityControl,
	PortalAccessControl
} from '@/app/(workspace)/settings/access/access-controls'

export const metadata: Metadata = { title: 'Access' }

const PAGE_SIZE = 20

type AccessParams = { page?: string }

function activeGrant(user: AccessUser) {
	return user.staffGrants.find((grant) => grant.revokedAt == null)
}

export default async function AccessPage({
	searchParams
}: {
	searchParams: Promise<AccessParams>
}) {
	const params = await searchParams
	const actor = await getActor()
	const result = await listAccessUsers(actor, {
		page: Number(params.page ?? '1') || 1,
		pageSize: PAGE_SIZE
	})

	if (!result.ok) return <ErrorState description={result.error.message} />

	const columns: readonly TableColumn<AccessUser>[] = [
		{
			id: 'user',
			header: 'User',
			cell: (user) => (
				<span className="min-w-0">
					<span className="block font-medium">{user.displayName}</span>
					<span className="block text-xs text-muted-foreground">
						{user.loginId} · {user.identityEmail}
					</span>
				</span>
			)
		},
		{
			id: 'role',
			header: 'Role',
			cell: (user) => {
				const grant = activeGrant(user)

				if (grant != null) {
					return (
						<Badge tone="accent">{grant.role === 'ADMIN' ? 'Administrator' : 'Accountant'}</Badge>
					)
				}

				return user.portalAccess == null ? (
					<span className="text-muted-foreground">No active role</span>
				) : (
					<Badge>Portal user</Badge>
				)
			}
		},
		{
			id: 'contact',
			header: 'Contact link',
			cell: (user) =>
				user.portalAccess == null ? (
					<span className="text-muted-foreground">-</span>
				) : (
					<Link
						href={`/contacts/${user.portalAccess.contact.id}`}
						className="text-accent hover:underline"
					>
						{user.portalAccess.contact.name}
					</Link>
				)
		},
		{
			id: 'validity',
			header: 'Grant validity',
			cell: (user) => {
				const grant = activeGrant(user)

				if (grant == null) return <span className="text-muted-foreground">-</span>

				return `${formatBusinessDate(grant.validFrom.slice(0, 10))} - ${
					grant.validUntil == null ? 'no expiry' : formatBusinessDate(grant.validUntil.slice(0, 10))
				}`
			}
		},
		{
			id: 'status',
			header: 'Status',
			cell: (user) => (
				<span className="inline-flex flex-wrap items-center gap-2">
					{user.status === 'ACTIVE' && <Badge tone="success">Active</Badge>}
					{user.status === 'DISABLED' && <Badge tone="danger">Disabled</Badge>}
					{user.status === 'PROVISIONING' && <Badge tone="warning">Provisioning</Badge>}
					{user.mustChangePassword && <Badge tone="warning">Password change required</Badge>}
					{user.portalAccess?.status === 'REVOKED' && <Badge tone="danger">Portal revoked</Badge>}
				</span>
			)
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: (user) => {
				const grant = activeGrant(user)

				return (
					<span className="flex flex-wrap gap-2">
						<IdentityControl
							userId={user.id}
							displayName={user.displayName}
							isDisabled={user.status === 'DISABLED'}
						/>
						{grant != null && (
							<GrantControl
								grantId={grant.id}
								displayName={user.displayName}
								role={grant.role === 'ADMIN' ? 'Administrator' : 'Accountant'}
							/>
						)}
						{user.portalAccess != null && user.portalAccess.status === 'ACTIVE' && (
							<PortalAccessControl
								portalAccessId={user.portalAccess.id}
								displayName={user.displayName}
							/>
						)}
					</span>
				)
			}
		}
	]

	return (
		<>
			<PageHeader
				title="Access"
				lead="Identities, business roles, contact links and portal access."
				breadcrumbs={[{ label: 'Settings' }, { label: 'Access' }]}
				action={
					actor.capabilities.includes('access:manage') ? (
						<Link href="/settings/access/new" className={buttonVariants({ size: 'sm' })}>
							<Plus aria-hidden="true" className="size-4" />
							New user
						</Link>
					) : null
				}
			/>

			<div className="rounded-xl border border-border bg-surface">
				<DataTable
					caption="Users and access"
					columns={columns}
					rows={result.data.rows}
					getRowKey={(user) => user.id}
					emptyState={
						<div className="p-5">
							<EmptyState
								icon={Users}
								title="No users yet"
								description="Create an administrator or a portal user linked to a contact."
							/>
						</div>
					}
				/>
				{result.data.rows.length > 0 && (
					<Pagination
						page={result.data.page}
						pageSize={result.data.pageSize}
						totalCount={result.data.totalCount}
						itemNoun="users"
						buildHref={(page) =>
							page === 1 ? '/settings/access' : `/settings/access?page=${page}`
						}
					/>
				)}
			</div>

			<p className="rounded-xl border border-border bg-surface-soft p-3 text-sm text-muted-foreground">
				Passwords are never displayed or stored by UrbanLedger. A failed provisioning attempt can be
				retried with the same details from the creation form.
			</p>
		</>
	)
}
