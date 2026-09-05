'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldGroup, FieldRow } from '@/components/ui/field'
import { FormErrorSummary, type FieldErrorEntry } from '@/components/ui/form-error-summary'
import { RadioField, TextInput } from '@/components/ui/inputs'
import { CONTACT_TYPES, CONTACT_TYPE_LABELS, type Contact } from '@/lib/masters/contact'
import { emptyMasterFormState } from '@/lib/masters/form-state'
import { saveContactAction } from '@/app/(workspace)/contacts/actions'

const FIELD_LABELS: Record<string, string> = {
	name: 'Contact name',
	type: 'Contact type',
	email: 'Email',
	mobile: 'Mobile',
	addressLine: 'Address',
	city: 'City',
	state: 'State',
	pincode: 'Pincode'
}

export function ContactForm({ contact }: { contact?: Contact }) {
	const [state, formAction, isPending] = useActionState(saveContactAction, emptyMasterFormState)

	const errorEntries: readonly FieldErrorEntry[] = Object.entries(state.errors).flatMap(
		([field, message]) =>
			message == null
				? []
				: [{ fieldId: `contact-${field}`, label: FIELD_LABELS[field] ?? field, message }]
	)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			{contact != null && <input type="hidden" name="contactId" value={contact.id} />}

			<FormErrorSummary errors={errorEntries} description={state.message} />

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<Field
					id="contact-name"
					label={FIELD_LABELS.name}
					hint="Shown on invoices, bills and payment receipts."
					error={state.errors.name}
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
					id="contact-type"
					label={FIELD_LABELS.type}
					hint="Customers appear on sales, vendors on purchases."
					error={state.errors.type}
					isRequired
				>
					{CONTACT_TYPES.map((value) => (
						<RadioField
							key={value}
							name="type"
							value={value}
							label={CONTACT_TYPE_LABELS[value]}
							defaultChecked={(contact?.type ?? 'customer') === value}
						/>
					))}
				</FieldGroup>

				<FieldRow>
					<Field
						id="contact-email"
						label={FIELD_LABELS.email}
						hint="Required before portal access can be enabled."
						error={state.errors.email}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								type="email"
								name="email"
								defaultValue={contact?.email}
								autoComplete="email"
							/>
						)}
					</Field>
					<Field
						id="contact-mobile"
						label={FIELD_LABELS.mobile}
						error={state.errors.mobile}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								inputMode="tel"
								name="mobile"
								defaultValue={contact?.mobile}
								autoComplete="tel"
							/>
						)}
					</Field>
				</FieldRow>

				<Field
					id="contact-addressLine"
					label={FIELD_LABELS.addressLine}
					error={state.errors.addressLine}
					isRequired
				>
					{(props) => (
						<TextInput {...props} name="addressLine" defaultValue={contact?.addressLine} />
					)}
				</Field>

				<FieldRow className="sm:grid-cols-3">
					<Field
						id="contact-city"
						label={FIELD_LABELS.city}
						error={state.errors.city}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="city" defaultValue={contact?.city} />}
					</Field>
					<Field
						id="contact-state"
						label={FIELD_LABELS.state}
						error={state.errors.state}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="state" defaultValue={contact?.state} />}
					</Field>
					<Field
						id="contact-pincode"
						label={FIELD_LABELS.pincode}
						error={state.errors.pincode}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								inputMode="numeric"
								name="pincode"
								defaultValue={contact?.pincode}
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
