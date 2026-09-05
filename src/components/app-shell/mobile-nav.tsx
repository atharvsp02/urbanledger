'use client'

import { useRef } from 'react'
import { Menu, X } from 'lucide-react'
import { SidebarNav } from '@/components/app-shell/sidebar-nav'
import type { ShellNavGroup } from '@/components/app-shell/types'

export function MobileNav({
	groups,
	account
}: {
	groups: readonly ShellNavGroup[]
	account?: React.ReactNode
}) {
	const dialogRef = useRef<HTMLDialogElement>(null)

	return (
		<>
			<button
				type="button"
				onClick={() => dialogRef.current?.showModal()}
				aria-label="Open navigation"
				className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-foreground hover:bg-surface-hover"
			>
				<Menu aria-hidden="true" className="size-5" />
			</button>

			<dialog
				ref={dialogRef}
				aria-label="Navigation"
				className="m-0 h-dvh max-h-none w-[19rem] max-w-[85vw] bg-surface p-0 text-foreground backdrop:bg-[rgb(32_39_37_/_0.45)]"
			>
				<div className="flex h-full flex-col">
					<div className="flex h-16 items-center justify-between border-b border-border px-4">
						<span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
							Navigation
						</span>
						<button
							type="button"
							onClick={() => dialogRef.current?.close()}
							aria-label="Close navigation"
							className="grid size-11 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface-hover"
						>
							<X aria-hidden="true" className="size-4" />
						</button>
					</div>

					<div className="flex-1 overflow-y-auto p-3">
						<SidebarNav groups={groups} onNavigate={() => dialogRef.current?.close()} />
					</div>

					{account != null && <div className="border-t border-border p-4">{account}</div>}
				</div>
			</dialog>
		</>
	)
}
