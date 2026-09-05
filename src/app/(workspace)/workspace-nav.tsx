import { Users } from 'lucide-react'
import type { ShellNavGroup } from '@/components/app-shell/types'

export const WORKSPACE_NAV_GROUPS: readonly ShellNavGroup[] = [
	{
		id: 'master-data',
		label: 'Master data',
		items: [
			{ id: 'contacts', label: 'Contacts', icon: <Users className="size-4" />, href: '/contacts' }
		]
	}
]
