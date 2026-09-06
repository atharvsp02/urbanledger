import Link from 'next/link'
import type { Metadata } from 'next'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { getActor } from '@/server/auth/actor'
import { getBusinessToday } from '@/server/business/today'
import { getBusinessSettings, getOpeningBalanceOptions, getSetupReadiness } from '@/server/business'
import { SetupForm } from '@/app/(workspace)/setup/setup-form'

export const metadata: Metadata = { title: 'Setup' }

const NEXT_STEPS = [
	{ href: '/accounting/accounts', label: 'Chart of accounts' },
	{ href: '/accounting/journals', label: 'Journals' },
	{ href: '/accounting/taxes', label: 'Taxes' },
	{ href: '/contacts', label: 'Contacts' },
	{ href: '/products', label: 'Products' }
]

export default async function SetupPage() {
	const actor = await getActor()
	const [readiness, settings] = await Promise.all([
		getSetupReadiness(actor),
		getBusinessSettings(actor)
	])

	if (!readiness.ok) return <ErrorState description={readiness.error.message} />
	if (!settings.ok) return <ErrorState description={settings.error.message} />

	const canManage = actor.capabilities.includes('business:manage')
	const options = canManage ? await getOpeningBalanceOptions(actor) : null
	const today = await getBusinessToday(actor)

	return (
		<>
			<PageHeader
				title="Setup"
				lead="What UrbanLedger still needs before posting is safe."
				breadcrumbs={[{ label: 'Setup' }]}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<Badge
					tone={readiness.data.isReadyToPost ? 'success' : 'warning'}
					icon={readiness.data.isReadyToPost ? CheckCircle2 : CircleDashed}
				>
					{readiness.data.isReadyToPost ? 'Ready to post' : 'Setup incomplete'}
				</Badge>
				{readiness.data.isSetupComplete && <Badge tone="success">Opening balances recorded</Badge>}
			</div>

			<WorkSurface
				title="Readiness checklist"
				description="Each item is checked against persisted records, never assumed."
			>
				{readiness.data.missingRequirements.length === 0 ? (
					<p className="text-sm text-success">
						Every requirement is satisfied. Transactions can be posted.
					</p>
				) : (
					<ul className="flex list-none flex-col gap-2 p-0">
						{readiness.data.missingRequirements.map((requirement) => (
							<li key={requirement} className="flex items-start gap-2 text-sm">
								<CircleDashed
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0 text-muted-foreground"
								/>
								<span>{requirement}</span>
							</li>
						))}
					</ul>
				)}

				<div className="mt-5 flex flex-wrap gap-2">
					{NEXT_STEPS.map((step) => (
						<Link
							key={step.href}
							href={step.href}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							{step.label}
						</Link>
					))}
				</div>
			</WorkSurface>

			<WorkSurface
				title="Business profile"
				description="Name, currency, timezone and fiscal year come from company settings."
			>
				<dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Business
						</dt>
						<dd className="mt-0.5 text-sm">{settings.data.name}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Currency
						</dt>
						<dd className="mt-0.5 text-sm">{settings.data.currency}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Timezone
						</dt>
						<dd className="mt-0.5 text-sm">{settings.data.timezone}</dd>
					</div>
					<div>
						<dt className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
							Fiscal year starts
						</dt>
						<dd className="mt-0.5 text-sm">
							Day {settings.data.fiscalYearStartDay}, month {settings.data.fiscalYearStartMonth}
						</dd>
					</div>
				</dl>
				<div className="mt-4">
					<Link
						href="/settings/company"
						className={buttonVariants({ variant: 'secondary', size: 'sm' })}
					>
						Edit company settings
					</Link>
				</div>
			</WorkSurface>

			{!canManage ? (
				<ForbiddenState description="Only an administrator can record opening balances." />
			) : readiness.data.isSetupComplete ? (
				<WorkSurface title="Opening balances">
					<p className="text-sm text-muted-foreground">
						Opening balances were already recorded. Further corrections go through a manual journal
						entry.
					</p>
					<div className="mt-4">
						<Link
							href="/accounting/entries"
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							Journal entries
						</Link>
					</div>
				</WorkSurface>
			) : options?.ok === true ? (
				<WorkSurface
					title="Opening cash and bank balances"
					description="Posts one balanced opening entry funded by capital."
				>
					<SetupForm options={options.data} revision={settings.data.revision} today={today} />
				</WorkSurface>
			) : (
				<ErrorState description={options?.ok === false ? options.error.message : undefined} />
			)}
		</>
	)
}
