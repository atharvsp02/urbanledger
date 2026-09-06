import Link from 'next/link'
import type { Role } from '@/lib/contracts/access'
import { buttonVariants } from '@/components/ui/button'
import { ContactAvatar } from '@/components/ui/placeholder'

const ROLE_LABELS: Record<Role, string> = {
	ADMIN: 'Admin',
	ACCOUNTANT: 'Accountant',
	CONTACT: 'Contact'
}

export function AccountBlock({
	displayName,
	role,
	imageUrl,
	profileHref,
	signOutAction
}: {
	displayName: string
	role: Role
	imageUrl?: string
	profileHref?: string
	signOutAction: () => Promise<void>
}) {
	const identity = (
		<>
			<ContactAvatar name={displayName} imageUrl={imageUrl} className="size-8" />
			<span className="min-w-0">
				<span className="block truncate text-[13px] font-medium text-foreground">
					{displayName}
				</span>
				<span className="block text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
			</span>
		</>
	)

	return (
		<div className="flex flex-col gap-3">
			{profileHref == null ? (
				<div className="flex items-start gap-2.5">{identity}</div>
			) : (
				<Link
					href={profileHref}
					className="flex items-start gap-2.5 rounded-lg p-1 transition-colors hover:bg-surface-hover motion-reduce:transition-none"
				>
					{identity}
				</Link>
			)}
			<Link
				href="/change-password"
				className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-full' })}
			>
				Change password
			</Link>
			<form action={signOutAction}>
				<button
					type="submit"
					className={buttonVariants({ variant: 'secondary', size: 'sm', className: 'w-full' })}
				>
					Sign out
				</button>
			</form>
		</div>
	)
}
