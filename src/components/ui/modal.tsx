'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Modal({
	isOpen,
	onClose,
	title,
	description,
	// While a command is in flight, Escape and the backdrop must not close a
	// surface whose outcome is still unknown.
	isDismissible = true,
	className,
	footer,
	children
}: {
	isOpen: boolean
	onClose: () => void
	title: string
	description?: string
	isDismissible?: boolean
	className?: string
	footer?: React.ReactNode
	children?: React.ReactNode
}) {
	const dialogRef = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	const descriptionId = useId()

	useEffect(() => {
		const dialog = dialogRef.current
		if (dialog == null) return
		if (isOpen && !dialog.open) dialog.showModal()
		if (!isOpen && dialog.open) dialog.close()
	}, [isOpen])

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			aria-describedby={description == null ? undefined : descriptionId}
			onCancel={(event) => {
				if (!isDismissible) event.preventDefault()
			}}
			onClose={onClose}
			onClick={(event) => {
				if (!isDismissible) return
				if (event.target === dialogRef.current) dialogRef.current?.close()
			}}
			className={cn(
				'm-auto w-[calc(100vw-2rem)] max-w-lg rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-[rgb(32_39_37_/_0.45)]',
				className
			)}
		>
			<div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
				<div className="min-w-0">
					<h2 id={titleId} className="text-base leading-tight font-semibold tracking-tight">
						{title}
					</h2>
					{description != null && (
						<p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				<button
					type="button"
					onClick={() => dialogRef.current?.close()}
					disabled={!isDismissible}
					aria-label="Close dialog"
					className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface-hover disabled:opacity-40"
				>
					<X aria-hidden="true" className="size-4" />
				</button>
			</div>

			{children != null && <div className="px-5 py-5">{children}</div>}

			{footer != null && (
				<div className="flex flex-wrap justify-end gap-3 border-t border-border px-5 py-4">
					{footer}
				</div>
			)}
		</dialog>
	)
}
