import Link from 'next/link'
import { ArrowRight, LineChart, Package, Plus, Users } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-panel'

const MASTER_DATA = [
	{
		href: '/contacts',
		newHref: '/contacts/new',
		icon: Users,
		title: 'Contacts',
		description: 'Customers and vendors used across sales, purchases and payments.',
		newLabel: 'New contact'
	},
	{
		href: '/products',
		newHref: '/products/new',
		icon: Package,
		title: 'Products',
		description: 'Goods, services and combos available on sales and purchase documents.',
		newLabel: 'New product'
	}
]

export default function DashboardPage() {
	return (
		<>
			<PageHeader title="Dashboard" lead="Master data available in this workspace." />

			<div className="grid gap-4 sm:grid-cols-2">
				{MASTER_DATA.map((area) => (
					<WorkSurface key={area.href} title={area.title} description={area.description}>
						<div className="flex flex-wrap gap-3">
							<Link href={area.newHref} className={buttonVariants({ size: 'sm' })}>
								<Plus aria-hidden="true" className="size-4" />
								{area.newLabel}
							</Link>
							<Link
								href={area.href}
								className={buttonVariants({ variant: 'secondary', size: 'sm' })}
							>
								Open {area.title.toLowerCase()}
								<ArrowRight aria-hidden="true" className="size-4" />
							</Link>
						</div>
					</WorkSurface>
				))}
			</div>

			<EmptyState
				icon={LineChart}
				title="No accounting activity yet"
				description="Outstanding balances, recent documents and financial summaries appear here once purchases, sales and payments are recorded."
			/>
		</>
	)
}
