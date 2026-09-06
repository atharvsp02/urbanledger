'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldGroup, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { RadioField, SelectInput, TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import type { AccessCreationOptions } from '@/lib/contracts/access-administration'
import { createAccessUserAction } from '@/app/(workspace)/settings/actions'

const FIELD_LABELS: Record<string, string> = {
	role: 'Role',
	displayName: 'Name',
	contactId: 'Contact',
	loginId: 'Login ID',
	email: 'Identity email',
	password: 'Initial password',
	passwordConfirmation: 'Confirm password'
}

export function AccessForm({ options }: { options: AccessCreationOptions }) {
	const [state, formAction, isPending] = useActionState(createAccessUserAction, null)
	const [operationKey] = useState(() => crypto.randomUUID())
	const [role, setRole] = useState<'ADMINISTRATOR' | 'USER'>('ADMINISTRATOR')
	const errorOf = (field: string) => firstFieldError(state, field)

	return (
		<form action={formAction} className="flex max-w-3xl flex-col gap-6">
			<input type="hidden" name="operationKey" value={operationKey} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'access', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
				code={state?.ok === false ? state.error.code : undefined}
			/>

			<div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
				<FieldGroup id="access-role" label={FIELD_LABELS.role} error={errorOf('role')} isRequired>
					<RadioField
						name="role"
						value="ADMINISTRATOR"
						label="Administrator"
						description="Full internal access, including user administration."
						checked={role === 'ADMINISTRATOR'}
						onChange={() => setRole('ADMINISTRATOR')}
					/>
					<RadioField
						name="role"
						value="USER"
						label="User"
						description="Portal access for one contact. Requires an explicit contact link."
						checked={role === 'USER'}
						onChange={() => setRole('USER')}
					/>
				</FieldGroup>

				{role === 'ADMINISTRATOR' ? (
					<Field
						id="access-displayName"
						label={FIELD_LABELS.displayName}
						error={errorOf('displayName')}
						isRequired
					>
						{(props) => <TextInput {...props} name="displayName" autoComplete="off" />}
					</Field>
				) : (
					<Field
						id="access-contactId"
						label={FIELD_LABELS.contactId}
						hint={
							options.contacts.length === 0
								? 'Create a contact before granting portal access.'
								: 'Portal access is linked to this contact record by its ID.'
						}
						error={errorOf('contactId')}
						isRequired
					>
						{(props) => (
							<SelectInput {...props} name="contactId" disabled={options.contacts.length === 0}>
								<option value="">Choose a contact</option>
								{options.contacts.map((contact) => (
									<option key={contact.id} value={contact.id}>
										{contact.name}
									</option>
								))}
							</SelectInput>
						)}
					</Field>
				)}

				<FieldRow>
					<Field
						id="access-loginId"
						label={FIELD_LABELS.loginId}
						hint="6 to 12 characters, unique across all identities."
						error={errorOf('loginId')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} name="loginId" autoComplete="off" />}
					</Field>
					<Field
						id="access-email"
						label={FIELD_LABELS.email}
						hint="Used to sign in."
						error={errorOf('email')}
						isRequired
						inRow
					>
						{(props) => <TextInput {...props} type="email" name="email" autoComplete="off" />}
					</Field>
				</FieldRow>

				<FieldRow>
					<Field
						id="access-password"
						label={FIELD_LABELS.password}
						hint="The user changes it on first sign-in."
						error={errorOf('password')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput {...props} type="password" name="password" autoComplete="new-password" />
						)}
					</Field>
					<Field
						id="access-passwordConfirmation"
						label={FIELD_LABELS.passwordConfirmation}
						error={errorOf('passwordConfirmation')}
						isRequired
						inRow
					>
						{(props) => (
							<TextInput
								{...props}
								type="password"
								name="passwordConfirmation"
								autoComplete="new-password"
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
					{isPending ? 'Creating' : 'Create user'}
				</button>
				<Link href="/settings/access" className={buttonVariants({ variant: 'secondary' })}>
					Cancel
				</Link>
			</div>

			<p className="text-sm text-muted-foreground">
				If provisioning fails partway, submit the same details again. The operation resumes instead
				of creating a second account, and the password is never stored by UrbanLedger.
			</p>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Creating the user. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
