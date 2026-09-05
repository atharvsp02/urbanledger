'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { activeNavHref } from '@/components/app-shell/nav-active'
import type { ShellNavGroup } from '@/components/app-shell/types'

const ROW_CLASS = 'flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm'

function NavItemIcon({ icon, isActive }: { icon: React.ReactNode; isActive: boolean }) {
	const { pending } = useLinkStatus()

	return (
		<span
			aria-hidden="true"
			className={cn(
				'relative grid size-4 shrink-0 place-items-center',
				isActive ? 'text-accent' : 'text-faint-foreground'
			)}
		>
			<span className={cn('transition-opacity delay-150 duration-150', pending && 'opacity-25')}>
				{icon}
			</span>
			{pending && <Loader2 className="absolute size-4 animate-spin motion-reduce:animate-none" />}
		</span>
	)
}

export function SidebarNav({
	groups,
	onNavigate
}: {
	groups: readonly ShellNavGroup[]
	onNavigate?: () => void
}) {
	const pathname = usePathname()
	const currentHref = activeNavHref({
		pathname,
		hrefs: groups.flatMap((group) => group.items.map((item) => item.href))
	})

	return (
		<nav aria-label="Sections" className="flex flex-col gap-5">
			{groups.map((group) => (
				<div key={group.id}>
					{group.label != null && (
						<p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-faint-foreground uppercase">
							{group.label}
						</p>
					)}
					<ul className="flex list-none flex-col gap-0.5 p-0">
						{group.items.map((item) => {
							const isActive = item.href === currentHref

							return (
								<li key={item.id}>
									<Link
										href={item.href}
										aria-current={isActive ? 'page' : undefined}
										onClick={onNavigate}
										className={cn(
											ROW_CLASS,
											'transition-colors motion-reduce:transition-none',
											isActive
												? 'bg-surface-tint font-semibold text-accent'
												: 'font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground'
										)}
									>
										<NavItemIcon icon={item.icon} isActive={isActive} />
										<span className="min-w-0 flex-1 truncate">{item.label}</span>
									</Link>
								</li>
							)
						})}
					</ul>
				</div>
			))}
		</nav>
	)
}
