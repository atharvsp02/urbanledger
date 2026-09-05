'use client'

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field, FieldRow } from '@/components/ui/field'
import { FormErrorSummary } from '@/components/ui/form-error-summary'
import { TextInput } from '@/components/ui/inputs'
import { fieldErrorEntries, firstFieldError } from '@/components/ui/action-errors'
import { enableContactAccessAction } from '@/app/(workspace)/contacts/actions'

const FIELD_LABELS: Record<string, string> = {
	loginId: 'Login ID',
	email: 'Identity email',
	password: 'Initial password',
	passwordConfirmation: 'Confirm password'
}

export function PortalAccessForm({
	contactId,
	defaultEmail
}: {
	contactId: string
	defaultEmail: string | null
}) {
	const [state, formAction, isPending] = useActionState(enableContactAccessAction, null)
	const errorOf = (field: string) => firstFieldError(state, field)

	if (state?.ok === true) {
		return (
			<p role="status" className="text-sm text-success">
				Portal access created for {state.data.loginId}.
			</p>
		)
	}

	return (
		<form action={formAction} className="flex flex-col gap-5">
			<input type="hidden" name="contactId" value={contactId} />

			<FormErrorSummary
				errors={fieldErrorEntries(state, 'access', FIELD_LABELS)}
				description={state?.ok === false ? state.error.message : undefined}
			/>

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
					hint="Used to sign in. Separate from the contact's business email."
					error={errorOf('email')}
					isRequired
					inRow
				>
					{(props) => (
						<TextInput
							{...props}
							type="email"
							name="email"
							defaultValue={defaultEmail ?? ''}
							autoComplete="off"
						/>
					)}
				</Field>
			</FieldRow>

			<FieldRow>
				<Field
					id="access-password"
					label={FIELD_LABELS.password}
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

			<div>
				<button type="submit" disabled={isPending} className={buttonVariants({ size: 'sm' })}>
					{isPending && (
						<Loader2
							aria-hidden="true"
							className="size-4 animate-spin motion-reduce:animate-none"
						/>
					)}
					{isPending ? 'Enabling' : 'Enable portal access'}
				</button>
			</div>

			<p role="status" aria-live="polite" className="sr-only">
				{isPending ? 'Enabling portal access. Waiting for the server to confirm.' : ''}
			</p>
		</form>
	)
}
