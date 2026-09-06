'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { PortalProfile } from '@/lib/contracts/portal-profile'
import { savePortalProfileAction } from '@/app/portal/profile/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Name',
	email: 'Contact email',
	mobile: 'Mobile',
	street: 'Address',
	city: 'City',
	state: 'State',
	pincode: 'Pincode'
}

export function PortalProfileForm({ profile }: { profile: PortalProfile }) {
	const [state, formAction, isPending] = useActionState(savePortalProfileAction, null)
	const current = state?.ok === true ? state.data : profile
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<input type="hidden" name="revision" value={current.revision} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'profile', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			{state?.ok === true && (
				<p className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/6 p-4 text-sm text-success">
					<CheckCircle2 aria-hidden="true" className="size-4" />
					Your profile was updated.
				</p>
			)}

			<div className="grid gap-5">
				<Field
					id="portal-profile-name"
					label={FIELD_LABELS.name}
					error={errorOf('name')}
					isRequired
				>
					{(props) => (
						<TextInput {...props} name="name" defaultValue={current.name} autoComplete="name" />
					)}
				</Field>

				<FieldRow>
					<Field
						id="portal-profile-email"
						label={FIELD_LABELS.email}
						hint="This is contact information. It does not change your sign-in email."
						error={errorOf('email')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								type="email"
								name="email"
								defaultValue={current.email ?? ''}
								autoComplete="email"
							/>
						)}
					</Field>
					<Field
						id="portal-profile-mobile"
						label={FIELD_LABELS.mobile}
						error={errorOf('mobile')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								name="mobile"
								defaultValue={current.mobile ?? ''}
								inputMode="tel"
								autoComplete="tel"
							/>
						)}
					</Field>
				</FieldRow>

				<Field id="portal-profile-street" label={FIELD_LABELS.street} error={errorOf('street')}>
					{(props) => (
						<TextInput
							{...props}
							name="street"
							defaultValue={current.street ?? ''}
							autoComplete="street-address"
						/>
					)}
				</Field>

				<FieldRow className="sm:grid-cols-3">
					<Field id="portal-profile-city" label={FIELD_LABELS.city} error={errorOf('city')} inRow>
						{(props) => (
							<TextInput
								{...props}
								name="city"
								defaultValue={current.city ?? ''}
								autoComplete="address-level2"
							/>
						)}
					</Field>
					<Field
						id="portal-profile-state"
						label={FIELD_LABELS.state}
						error={errorOf('state')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								name="state"
								defaultValue={current.state ?? ''}
								autoComplete="address-level1"
							/>
						)}
					</Field>
					<Field
						id="portal-profile-pincode"
						label={FIELD_LABELS.pincode}
						error={errorOf('pincode')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								name="pincode"
								defaultValue={current.pincode ?? ''}
								inputMode="numeric"
								autoComplete="postal-code"
							/>
						)}
					</Field>
				</FieldRow>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button type="submit" disabled={isPending} className={buttonVariants()}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Saving' : 'Save changes'}
				</button>
				<Link href="/portal" className={buttonVariants({ variant: 'secondary' })}>
					Back to overview
				</Link>
			</div>
		</form>
	)
}
