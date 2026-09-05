import { Brand } from '@/components/app-shell/brand'
import { MobileNav } from '@/components/app-shell/mobile-nav'
import { SidebarNav } from '@/components/app-shell/sidebar-nav'
import type { ShellNavGroup } from '@/components/app-shell/types'

export function AppShell({
	productLabel,
	homeHref,
	groups,
	account,
	children
}: {
	productLabel: string
	homeHref: string
	groups: readonly ShellNavGroup[]
	account?: React.ReactNode
	children: React.ReactNode
}) {
	const brand = <Brand homeHref={homeHref} productLabel={productLabel} />

	return (
		<div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
			<aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
				<div className="flex h-16 shrink-0 items-center border-b border-border px-5">{brand}</div>
				<div className="flex-1 overflow-y-auto p-3">
					<SidebarNav groups={groups} />
				</div>
				{account != null && <div className="shrink-0 border-t border-border p-4">{account}</div>}
			</aside>

			<div className="flex min-w-0 flex-col">
				<div className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
					<MobileNav groups={groups} account={account} />
					{brand}
				</div>

				<main
					id="main-content"
					tabIndex={-1}
					className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
				>
					<div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">{children}</div>
				</main>
			</div>
		</div>
	)
}
