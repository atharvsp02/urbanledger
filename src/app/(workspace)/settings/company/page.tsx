import type { Metadata } from 'next'
import { PageHeader, WorkSurface } from '@/components/app-shell/page-header'
import { ErrorState, ForbiddenState } from '@/components/ui/state-panel'
import { formatBusinessDate } from '@/lib/format'
import { getActor } from '@/server/auth/actor'
import { getBusinessSettings } from '@/server/business'
import { CompanyForm } from '@/app/(workspace)/settings/company/company-form'
import { LockDateForm } from '@/app/(workspace)/settings/company/lock-date-form'

export const metadata: Metadata = { title: 'Company settings' }

export default async function CompanySettingsPage() {
	const actor = await getActor()
	const settings = await getBusinessSettings(actor)

	if (!settings.ok) return <ErrorState description={settings.error.message} />

	const canManage = actor.capabilities.includes('business:manage')

	return (
		<>
			<PageHeader
				title="Company settings"
				lead="Business identity, currency, fiscal year, document prefixes and the accounting lock."
				breadcrumbs={[{ label: 'Settings' }, { label: 'Company' }]}
			/>

			{!canManage ? (
				<>
					<ForbiddenState description="Only an administrator can change company settings." />
					<WorkSurface title="Current configuration">
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
									Accounting lock
								</dt>
								<dd className="mt-0.5 text-sm">
									{settings.data.accountingLockDate == null
										? 'Not set'
										: formatBusinessDate(settings.data.accountingLockDate)}
								</dd>
							</div>
						</dl>
					</WorkSurface>
				</>
			) : (
				<>
					<CompanyForm settings={settings.data} />

					<WorkSurface
						title="Accounting lock"
						description="Locking a period prevents new postings on or before the chosen date. Changes are audited."
					>
						<LockDateForm
							revision={settings.data.revision}
							lockDate={settings.data.accountingLockDate}
						/>
					</WorkSurface>
				</>
			)}
		</>
	)
}
