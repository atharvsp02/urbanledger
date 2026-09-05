'use client'

import { useActionState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { TextInput } from '@/components/ui/inputs'
import { firstFieldError } from '@/components/ui/action-errors'
import { createCategoryAction } from '@/app/(workspace)/products/actions'

export function CategoryForm() {
	const [state, formAction, isPending] = useActionState(createCategoryAction, null)

	return (
		<form
			action={formAction}
			className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
		>
			<Field
				id="category-name"
				label="New category"
				error={
					firstFieldError(state, 'name') ?? (state?.ok === false ? state.error.message : undefined)
				}
				isRequired
				className="min-w-0 flex-1"
			>
				{(props) => <TextInput {...props} name="name" placeholder="Seating" />}
			</Field>
			<button type="submit" disabled={isPending} className={buttonVariants({ size: 'sm' })}>
				{isPending ? (
					<Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
				) : (
					<Plus aria-hidden="true" className="size-4" />
				)}
				{isPending ? 'Adding' : 'Add category'}
			</button>

			<p role="status" aria-live="polite" className="sr-only">
				{state?.ok === true ? `Category ${state.data.name} created.` : ''}
			</p>
		</form>
	)
}
