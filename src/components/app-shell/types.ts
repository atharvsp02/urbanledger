import type { ReactNode } from 'react'

// Every item carries a destination that exists. Navigation is not a place to
// advertise an unbuilt screen.
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
