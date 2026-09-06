import { Home, UserRound } from 'lucide-react'
import type { ShellNavGroup } from '@/components/app-shell/types'

export const PORTAL_NAV_GROUPS: readonly ShellNavGroup[] = [
	{
		id: 'portal',
		items: [
			{ id: 'home', label: 'Overview', icon: <Home className="size-4" />, href: '/portal' },
			{
				id: 'profile',
				label: 'Profile',
				icon: <UserRound className="size-4" />,
				href: '/portal/profile'
			}
		]
	}
]
