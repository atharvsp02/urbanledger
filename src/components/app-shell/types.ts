import type { ReactNode } from 'react'

export type ShellNavItem = {
	id: string
	label: string
	icon: ReactNode
	href: string
}

export type ShellNavGroup = {
	id: string
	label?: string
	items: readonly ShellNavItem[]
}
