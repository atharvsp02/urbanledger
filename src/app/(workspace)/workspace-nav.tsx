import {
	BookOpen,
	Building2,
	FileText,
	History,
	LineChart,
	LayoutDashboard,
	NotebookPen,
	Package,
	PackageCheck,
	Percent,
	ReceiptText,
	Scale,
	ScrollText,
	ShoppingBag,
	ShoppingCart,
	Tags,
	Users,
	Truck,
	PiggyBank,
	Wallet,
	Warehouse,
	Wrench
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
				id: 'analytic-accounts',
				label: 'Analytic accounts',
				icon: <Tags className="size-4" />,
				href: '/accounting/analytic-accounts',
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
		id: 'planning',
		label: 'Planning',
		items: [
			{
				id: 'budgets',
				label: 'Budgets',
				icon: <PiggyBank className="size-4" />,
				href: '/budgets',
				capability: 'masters:read'
			}
		]
	},
	{
		id: 'reports',
		label: 'Reports',
		items: [
			{
				id: 'balance-sheet',
				label: 'Balance sheet',
				icon: <Scale className="size-4" />,
				href: '/reports/balance-sheet',
				capability: 'reports:read'
			},
			{
				id: 'profit-loss',
				label: 'Profit and loss',
				icon: <LineChart className="size-4" />,
				href: '/reports/profit-loss',
				capability: 'reports:read'
			},
			{
				id: 'budget-report',
				label: 'Budget report',
				icon: <PiggyBank className="size-4" />,
				href: '/reports/budget',
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
			},
			{
				id: 'purchase-receipts',
				label: 'Receipts',
				icon: <PackageCheck className="size-4" />,
				href: '/purchases/receipts',
				capability: 'transactions:read'
			},
			{
				id: 'vendor-bills',
				label: 'Vendor bills',
				icon: <ReceiptText className="size-4" />,
				href: '/purchases/bills',
				capability: 'transactions:read'
			}
		]
	},
	{
		id: 'sales',
		label: 'Sales',
		items: [
			{
				id: 'sales-orders',
				label: 'Sales orders',
				icon: <ShoppingBag className="size-4" />,
				href: '/sales/orders',
				capability: 'transactions:read'
			},
			{
				id: 'sales-deliveries',
				label: 'Deliveries',
				icon: <Truck className="size-4" />,
				href: '/sales/deliveries',
				capability: 'transactions:read'
			},
			{
				id: 'customer-invoices',
				label: 'Customer invoices',
				icon: <FileText className="size-4" />,
				href: '/sales/invoices',
				capability: 'transactions:read'
			}
		]
	},
	{
		id: 'payments',
		label: 'Payments',
		items: [
			{
				id: 'payments-list',
				label: 'Payments',
				icon: <Wallet className="size-4" />,
				href: '/payments',
				capability: 'transactions:read'
			}
		]
	},
	{
		id: 'administration',
		label: 'Administration',
		items: [
			{
				id: 'setup',
				label: 'Setup',
				icon: <Wrench className="size-4" />,
				href: '/setup',
				capability: 'business:manage'
			},
			{
				id: 'company',
				label: 'Company',
				icon: <Building2 className="size-4" />,
				href: '/settings/company',
				capability: 'transactions:read'
			},
			{
				id: 'access',
				label: 'Access',
				icon: <Users className="size-4" />,
				href: '/settings/access',
				capability: 'access:manage'
			},
			{
				id: 'audit',
				label: 'Audit',
				icon: <ScrollText className="size-4" />,
				href: '/settings/audit',
				capability: 'audit:read'
			}
		]
	},
	{
		id: 'inventory',
		label: 'Inventory',
		items: [
			{
				id: 'stock',
				label: 'Stock',
				icon: <Warehouse className="size-4" />,
				href: '/stock',
				capability: 'transactions:read'
			},
			{
				id: 'stock-movements',
				label: 'Stock movements',
				icon: <History className="size-4" />,
				href: '/stock/movements',
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
