import type { InputHTMLAttributes, ReactNode } from 'react'

export function AuthField({
	label,
	error,
	...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
	const errorId = error && props.name ? `${props.name}-error` : undefined

	return (
		<label className="block text-sm font-medium">
			<span>{label}</span>
			<input
				{...props}
				aria-invalid={Boolean(error)}
				aria-describedby={errorId}
				className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
			/>
			{error ? (
				<span id={errorId} className="mt-1 block text-sm text-red-700">
					{error}
				</span>
			) : null}
		</label>
	)
}

export function AuthSubmit({ pending, children }: { pending: boolean; children: ReactNode }) {
	return (
		<button
			type="submit"
			disabled={pending}
			className="min-h-11 w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground disabled:cursor-wait disabled:opacity-60"
		>
			{children}
		</button>
	)
}

export function FormMessage({ message }: { message?: string }) {
	return message ? (
		<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
			{message}
		</p>
	) : null
}
