'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { BusinessSettings } from '@/lib/contracts/business'
import { saveCompanySettingsAction } from '@/app/(workspace)/settings/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Business name',
	addressLine1: 'Address line 1',
	addressLine2: 'Address line 2',
	city: 'City',
	state: 'State',
	postalCode: 'Postal code',
	country: 'Country',
	currency: 'Currency',
	timezone: 'Timezone',
	fiscalYearStartMonth: 'Fiscal year start month',
	fiscalYearStartDay: 'Fiscal year start day',
	purchaseOrderPrefix: 'Purchase order',
	salesOrderPrefix: 'Sales order',
	purchaseReceiptPrefix: 'Purchase receipt',
	salesDeliveryPrefix: 'Sales delivery',
	customerInvoicePrefix: 'Customer invoice',
	vendorBillPrefix: 'Vendor bill',
	customerPaymentPrefix: 'Customer payment',
	vendorPaymentPrefix: 'Vendor payment',
	journalEntryPrefix: 'Journal entry'
}

const PREFIX_FIELDS = [
	'purchaseOrderPrefix',
	'salesOrderPrefix',
	'purchaseReceiptPrefix',
	'salesDeliveryPrefix',
	'customerInvoicePrefix',
	'vendorBillPrefix',
	'customerPaymentPrefix',
	'vendorPaymentPrefix',
	'journalEntryPrefix'
] as const

export function CompanyForm({ settings }: { settings: BusinessSettings }) {
	const [state, formAction, isPending] = useActionState(saveCompanySettingsAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />
			<input type="hidden" name="expectedRevision" value={settings.revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'company', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			{state?.ok === true && (
				<p role="status" className="text-sm text-success">
					Company settings saved.
				</p>
			)}

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field id="company-name" label={FIELD_LABELS.name} error={errorOf('name')} isRequired>
					{(props) => <TextInput {...props} name="name" defaultValue={settings.name} />}
				</Field>

				<FieldRow>
					<Field
						id="company-addressLine1"
						label={FIELD_LABELS.addressLine1}
						error={errorOf('addressLine1')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								name="addressLine1"
								defaultValue={settings.addressLine1 ?? ''}
							/>
						)}
					</Field>
					<Field
						id="company-addressLine2"
						label={FIELD_LABELS.addressLine2}
						error={errorOf('addressLine2')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								name="addressLine2"
								defaultValue={settings.addressLine2 ?? ''}
							/>
						)}
					</Field>
				</FieldRow>

				<FieldRow className="sm:grid-cols-4">
					<Field id="company-city" label={FIELD_LABELS.city} error={errorOf('city')} inRow>
						{(props) => <TextInput {...props} name="city" defaultValue={settings.city ?? ''} />}
					</Field>
					<Field id="company-state" label={FIELD_LABELS.state} error={errorOf('state')} inRow>
						{(props) => <TextInput {...props} name="state" defaultValue={settings.state ?? ''} />}
					</Field>
					<Field
						id="company-postalCode"
						label={FIELD_LABELS.postalCode}
						error={errorOf('postalCode')}
						inRow
					>
						{(props) => (
							<TextInput {...props} name="postalCode" defaultValue={settings.postalCode ?? ''} />
						)}
					</Field>
					<Field
						id="company-country"
						label={FIELD_LABELS.country}
						error={errorOf('country')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="country" defaultValue={settings.country} />}
					</Field>
				</FieldRow>

				<FieldRow className="sm:grid-cols-4">
					<Field
						id="company-currency"
						label={FIELD_LABELS.currency}
						hint="Three-letter code."
						error={errorOf('currency')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="currency" defaultValue={settings.currency} />}
					</Field>
					<Field
						id="company-timezone"
						label={FIELD_LABELS.timezone}
						hint="Decides today's business date."
						error={errorOf('timezone')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="timezone" defaultValue={settings.timezone} />}
					</Field>
					<Field
						id="company-fiscalYearStartMonth"
						label={FIELD_LABELS.fiscalYearStartMonth}
						error={errorOf('fiscalYearStartMonth')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								inputMode="numeric"
								name="fiscalYearStartMonth"
								defaultValue={String(settings.fiscalYearStartMonth)}
							/>
						)}
					</Field>
					<Field
						id="company-fiscalYearStartDay"
						label={FIELD_LABELS.fiscalYearStartDay}
						error={errorOf('fiscalYearStartDay')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								inputMode="numeric"
								name="fiscalYearStartDay"
								defaultValue={String(settings.fiscalYearStartDay)}
							/>
						)}
					</Field>
				</FieldRow>
			</div>

			<div className="rounded-xl border border-border bg-surface p-5">
				<h2 className="text-[15px] font-semibold tracking-tight">Document prefixes</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Prefixes apply to numbers issued from now on. Existing documents keep their number.
				</p>
				<div className="mt-4 grid gap-4 sm:grid-cols-3">
					{PREFIX_FIELDS.map((field) => (
						<Field
							key={field}
							id={`company-${field}`}
							label={FIELD_LABELS[field]}
							error={errorOf(field)}
							isRequired
						>
							{(props) => <TextInput {...props} name={field} defaultValue={settings[field]} />}
						</Field>
					))}
				</div>
			</div>

			<div>
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : 'Save company settings'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Saving. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
