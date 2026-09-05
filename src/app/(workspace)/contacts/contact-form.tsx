'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldGroup, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { RadioField, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import { contactKinds, CONTACT_KIND_LABELS, type ContactDetail } from '@/lib/masters/contact'
import { saveContactAction } from '@/app/(workspace)/contacts/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Contact name',
	kind: 'Contact type',
	email: 'Email',
	mobile: 'Mobile',
	street: 'Address',
	city: 'City',
	state: 'State',
	pincode: 'Pincode'
}

export function ContactForm({ contact }: { contact?: ContactDetail }) {
	const [state, formAction, isPending] = useActionState(saveContactAction, null)
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{contact != null && (
				<>
					<input type="hidden" name="contactId" value={contact.id} />
					<input type="hidden" name="revision" value={contact.revision} />
				</>
			)}

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'contact', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field
					id="contact-name"
					label={FIELD_LABELS.name}
					hint="Shown on invoices, bills and payment receipts."
					error={errorOf('name')}
					isRequired
				>
					{(props) => (
						<TextInput
							{...props}
							name="name"
							defaultValue={contact?.name}
							autoComplete="organization"
						/>
					)}
				</Field>

				<FieldGroup
					id="contact-kind"
					label={FIELD_LABELS.kind}
					hint="Customers appear on sales, vendors on purchases."
					error={errorOf('kind')}
					isRequired
				>
					{contactKinds.map((value) => (
						<RadioField
							key={value}
							name="kind"
							value={value}
							label={CONTACT_KIND_LABELS[value]}
							defaultChecked={(contact?.kind ?? 'CUSTOMER') === value}
						/>
					))}
				</FieldGroup>

				<FieldRow>
					<Field
						id="contact-email"
						label={FIELD_LABELS.email}
						hint="Contacts may share an email address."
						error={errorOf('email')}
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								type="email"
								name="email"
								defaultValue={contact?.email ?? ''}
								autoComplete="email"
							/>
						)}
					</Field>
					<Field id="contact-mobile" label={FIELD_LABELS.mobile} error={errorOf('mobile')} inRow>
						{(props) => (
							<TextInput
								{...props}
								inputMode="tel"
								name="mobile"
								defaultValue={contact?.mobile ?? ''}
								autoComplete="tel"
							/>
						)}
					</Field>
				</FieldRow>

				<Field id="contact-street" label={FIELD_LABELS.street} error={errorOf('street')}>
					{(props) => <TextInput {...props} name="street" defaultValue={contact?.street ?? ''} />}
				</Field>

				<FieldRow className="sm:grid-cols-3">
					<Field id="contact-city" label={FIELD_LABELS.city} error={errorOf('city')} inRow>
						{(props) => <TextInput {...props} name="city" defaultValue={contact?.city ?? ''} />}
					</Field>
					<Field id="contact-state" label={FIELD_LABELS.state} error={errorOf('state')} inRow>
						{(props) => <TextInput {...props} name="state" defaultValue={contact?.state ?? ''} />}
					</Field>
					<Field id="contact-pincode" label={FIELD_LABELS.pincode} error={errorOf('pincode')} inRow>
						{(props) => (
							<TextInput
								{...props}
								inputMode="numeric"
								name="pincode"
								defaultValue={contact?.pincode ?? ''}
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
					{isPending ? 'Saving' : contact == null ? 'Create contact' : 'Save changes'}
				</button>
				<Link
					href={contact == null ? '/contacts' : `/contacts/${contact.id}`}
					className={buttonVariants({ variant: 'secondary' })}
				>
					Cancel
				</Link>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Saving. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
