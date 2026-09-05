import {
	BookOpen,
	LayoutDashboard,
	NotebookPen,
	Package,
	Percent,
	Scale,
	ShoppingCart,
	Users
} from 'lucide-react'
import type { Actor, Capability } from '@/lib/contracts/access'
import type { ShellNavGroup } from '@/components/app-shell/types'

type NavDefinition = {
	id: string
	label?: string
	items: readonly {
		id: string
		label: string
		icon: React.ReactNode
		href: string
		capability?: Capability
	}[]
}

const NAV_DEFINITION: readonly NavDefinition[] = [
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
			{
				id: 'contacts',
				label: 'Contacts',
				icon: <Users className="size-4" />,
				href: '/contacts',
				capability: 'contacts:read'
			},
			{
				id: 'products',
				label: 'Products',
				icon: <Package className="size-4" />,
				href: '/products',
				capability: 'masters:read'
			}
		]
	},
	{
		id: 'accounting',
		label: 'Accounting',
		items: [
			{
				id: 'accounts',
				label: 'Chart of accounts',
				icon: <BookOpen className="size-4" />,
				href: '/accounting/accounts',
				capability: 'masters:read'
			},
			{
				id: 'journals',
				label: 'Journals',
				icon: <NotebookPen className="size-4" />,
				href: '/accounting/journals',
				capability: 'masters:read'
			},
			{
				id: 'entries',
				label: 'Journal entries',
				icon: <NotebookPen className="size-4" />,
				href: '/accounting/entries',
				capability: 'transactions:read'
			},
			{
				id: 'taxes',
				label: 'Taxes',
				icon: <Percent className="size-4" />,
				href: '/accounting/taxes',
				capability: 'masters:read'
			},
			{
				id: 'trial-balance',
				label: 'Trial balance',
				icon: <Scale className="size-4" />,
				href: '/reports/trial-balance',
				capability: 'reports:read'
			}
		]
	},
	{
		id: 'purchases',
		label: 'Purchases',
		items: [
			{
				id: 'purchase-orders',
				label: 'Purchase orders',
				icon: <ShoppingCart className="size-4" />,
				href: '/purchases/orders',
				capability: 'transactions:read'
			}
		]
	}
]

export function workspaceNavGroups(actor: Actor): readonly ShellNavGroup[] {
	return NAV_DEFINITION.map((group) => ({
		id: group.id,
		label: group.label,
		items: group.items.filter(
			(item) => item.capability == null || actor.capabilities.includes(item.capability)
		)
	})).filter((group) => group.items.length > 0)
}
