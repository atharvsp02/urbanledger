import { useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export const fieldControlClassName =
	'min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground transition-colors placeholder:text-faint-foreground focus:border-border-strong aria-invalid:border-danger motion-reduce:transition-none'

// Children set `inRow` to share this row's subgrid, so a hint on one field
// cannot push its control below its neighbour's.
export function FieldRow({
	className,
	children
}: {
	className?: string
	children: React.ReactNode
}) {
	return <div className={cn('grid gap-4 sm:grid-cols-2 sm:gap-y-1.5', className)}>{children}</div>
}

function useFieldIds({
	providedId,
	hint,
	error
}: {
	providedId?: string
	hint?: string
	error?: string
}) {
	const generatedId = useId()
	const id = providedId ?? generatedId
	const hintId = `${id}-hint`
	const errorId = `${id}-error`
	const describedBy = [hint != null ? hintId : null, error != null ? errorId : null]
		.filter((value) => value != null)
		.join(' ')

	return {
		id,
		hintId,
		errorId,
		describedBy: describedBy.length > 0 ? describedBy : undefined
	}
}

function FieldError({ id, message, inRow }: { id: string; message: string; inRow: boolean }) {
	return (
		<p
			id={id}
			className={cn(
				'flex items-start gap-1.5 text-sm leading-relaxed text-danger',
				inRow && 'sm:row-start-4'
			)}
		>
			<AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<span>{message}</span>
		</p>
	)
}

function fieldShellClassName(inRow: boolean, hasError: boolean, className?: string) {
	return cn(
		'flex flex-col gap-1.5',
		inRow &&
			(hasError
				? 'sm:row-span-4 sm:grid sm:grid-rows-subgrid'
				: 'sm:row-span-3 sm:grid sm:grid-rows-subgrid'),
		className
	)
}

export function Field({
	id: providedId,
	label,
	hint,
	error,
	isRequired = false,
	inRow = false,
	className,
	children
}: {
	id?: string
	label: string
	hint?: string
	error?: string
	isRequired?: boolean
	inRow?: boolean
	className?: string
	children: (props: {
		id: string
		'aria-describedby': string | undefined
		'aria-invalid': boolean | undefined
		required: boolean
	}) => React.ReactNode
}) {
	const { id, hintId, errorId, describedBy } = useFieldIds({ providedId, hint, error })
	const control = children({
		id,
		'aria-describedby': describedBy,
		'aria-invalid': error != null ? true : undefined,
		required: isRequired
	})

	return (
		<div className={fieldShellClassName(inRow, error != null, className)}>
			<label
				htmlFor={id}
				className={cn('text-sm font-medium text-foreground', inRow && 'sm:row-start-1')}
			>
				{label}
				{isRequired && (
					<span className="ml-1.5 text-xs font-semibold text-faint-foreground">Required</span>
				)}
			</label>

			{hint != null && (
				<p
					id={hintId}
					className={cn('text-sm leading-relaxed text-muted-foreground', inRow && 'sm:row-start-2')}
				>
					{hint}
				</p>
			)}

			{inRow ? <div className="sm:row-start-3">{control}</div> : control}

			{error != null && <FieldError id={errorId} message={error} inRow={inRow} />}
		</div>
	)
}

// A <label> may only name one form element, so a control group is named by a
// labelled group instead.
export function FieldGroup({
	id: providedId,
	label,
	hint,
	error,
	isRequired = false,
	inRow = false,
	className,
	children
}: {
	id?: string
	label: string
	hint?: string
	error?: string
	isRequired?: boolean
	inRow?: boolean
	className?: string
	children: React.ReactNode
}) {
	const { id, hintId, errorId, describedBy } = useFieldIds({ providedId, hint, error })
	const labelId = `${id}-label`

	return (
		<div className={fieldShellClassName(inRow, error != null, className)}>
			<span
				id={labelId}
				className={cn('text-sm font-medium text-foreground', inRow && 'sm:row-start-1')}
			>
				{label}
				{isRequired && (
					<span className="ml-1.5 text-xs font-semibold text-faint-foreground">Required</span>
				)}
			</span>

			{hint != null && (
				<p
					id={hintId}
					className={cn('text-sm leading-relaxed text-muted-foreground', inRow && 'sm:row-start-2')}
				>
					{hint}
				</p>
			)}

			<div
				role="group"
				aria-labelledby={labelId}
				aria-describedby={describedBy}
				className={cn('flex flex-col gap-2', inRow && 'sm:row-start-3')}
			>
				{children}
			</div>

			{error != null && <FieldError id={errorId} message={error} inRow={inRow} />}
		</div>
	)
}
