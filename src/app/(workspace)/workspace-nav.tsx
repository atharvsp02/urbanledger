import { LayoutDashboard, Package, Users } from 'lucide-react'
import type { ShellNavGroup } from '@/components/app-shell/types'

export const WORKSPACE_NAV_GROUPS: readonly ShellNavGroup[] = [
	{
		id: 'overview',
		items: [
			{
				id: 'dashboard',
				label: 'Dashboard',
				icon: <LayoutDashboard className="size-4" />,
				href: '/dashboard'
			}
		]
	},
	{
		id: 'master-data',
		label: 'Master data',
		items: [
			{ id: 'contacts', label: 'Contacts', icon: <Users className="size-4" />, href: '/contacts' },
			{ id: 'products', label: 'Products', icon: <Package className="size-4" />, href: '/products' }
		]
	}
]
