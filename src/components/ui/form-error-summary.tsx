'use client'

import { useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

export type FieldErrorEntry = { fieldId: string; label: string; message: string }

// Takes focus on rejection, and each entry moves focus to its own field.
export function FormErrorSummary({
	title = 'This form could not be submitted',
	description,
	errors
}: {
	title?: string
	description?: string
	errors: readonly FieldErrorEntry[]
}) {
	const headingRef = useRef<HTMLParagraphElement>(null)
	// A rejection without field errors, such as a stale revision, still has to
	// reach the reader.
	const isVisible = errors.length > 0 || description != null

	useEffect(() => {
		if (isVisible) headingRef.current?.focus()
	}, [isVisible, description, errors])

	if (!isVisible) return null

	return (
		<div
			role="alert"
			className="rounded-xl border border-danger/25 bg-danger/6 p-4 sm:p-5"
			data-testid="form-error-summary"
		>
			<p
				ref={headingRef}
				tabIndex={-1}
				className="flex items-start gap-2 text-sm font-semibold text-danger outline-none"
			>
				<AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				<span>{title}</span>
			</p>
			{description != null && (
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
			)}
			{errors.length > 0 && (
				<ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
					{errors.map((error) => (
						<li key={error.fieldId}>
							<a
								href={`#${error.fieldId}`}
								className="text-sm text-danger underline underline-offset-2"
								onClick={(event) => {
									const target = document.getElementById(error.fieldId)
									if (target == null) return
									event.preventDefault()
									target.focus()
								}}
							>
								{error.label}: {error.message}
							</a>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
