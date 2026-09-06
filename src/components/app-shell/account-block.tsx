import Link from 'next/link'
import type { Role } from '@/lib/contracts/access'
import { buttonVariants } from '@/components/ui/button'

const ROLE_LABELS: Record<Role, string> = {
	ADMIN: 'Admin',
	ACCOUNTANT: 'Accountant',
	CONTACT: 'Contact'
}

export function AccountBlock({
	displayName,
	role,
	signOutAction
}: {
	displayName: string
	role: Role
	signOutAction: () => Promise<void>
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-2.5">
				<span
					aria-hidden="true"
					className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-tint text-[11px] font-semibold text-accent"
				>
					{displayName.slice(0, 2).toUpperCase()}
				</span>
				<span className="min-w-0">
					<span className="block truncate text-[13px] font-medium text-foreground">
						{displayName}
					</span>
					<span className="block text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
				</span>
			</div>
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
