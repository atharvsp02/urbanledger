'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { buttonVariants, type ButtonVariants } from '@/components/ui/button'
import { cn } from '@/lib/cn'

type ConfirmState =
	| { status: 'idle' }
	| { status: 'pending' }
	| { status: 'failed'; message: string }
	| { status: 'committed' }

// Success is what the server committed, not what the click implied: the dialog
// stays open and repeat-proof until the command resolves.
export function ConfirmDialog({
	triggerLabel,
	triggerVariant = 'secondary',
	title,
	description,
	consequence,
	confirmLabel,
	cancelLabel = 'Cancel',
	isDestructive = false,
	isDisabled = false,
	successMessage,
	onConfirm
}: {
	triggerLabel: string
	triggerVariant?: NonNullable<ButtonVariants['variant']>
	title: string
	description: string
	consequence?: string
	confirmLabel: string
	cancelLabel?: string
	isDestructive?: boolean
	isDisabled?: boolean
	successMessage?: string
	onConfirm: () => Promise<void>
}) {
	const [isOpen, setIsOpen] = useState(false)
	const [state, setState] = useState<ConfirmState>({ status: 'idle' })
	const isPending = state.status === 'pending'

	async function confirm() {
		if (isPending) return
		setState({ status: 'pending' })
		try {
			await onConfirm()
			setState({ status: 'committed' })
			setIsOpen(false)
		} catch (error) {
			setState({
				status: 'failed',
				message:
					error instanceof Error && error.message.length > 0
						? error.message
						: 'The request did not complete. Nothing was changed.'
			})
		}
	}

	return (
		<>
			<button
				type="button"
				disabled={isDisabled}
				onClick={() => {
					setState({ status: 'idle' })
					setIsOpen(true)
				}}
				className={buttonVariants({ variant: triggerVariant, size: 'sm' })}
			>
				{triggerLabel}
			</button>

			<Modal
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				isDismissible={!isPending}
				title={title}
				description={description}
				footer={
					<>
						<button
							type="button"
							disabled={isPending}
							onClick={() => setIsOpen(false)}
							className={buttonVariants({ variant: 'secondary', size: 'sm' })}
						>
							{cancelLabel}
						</button>
						<button
							type="button"
							disabled={isPending}
							onClick={confirm}
							className={cn(
								buttonVariants({ variant: isDestructive ? 'danger' : 'primary', size: 'sm' })
							)}
						>
							{isPending && (
								<Loader2
									aria-hidden="true"
									className="size-4 animate-spin motion-reduce:animate-none"
								/>
							)}
							{isPending ? 'Working' : confirmLabel}
						</button>
					</>
				}
			>
				{isDestructive && (
					<span className="mb-4 grid size-10 place-items-center rounded-full border border-danger/25 bg-danger/8 text-danger">
						<AlertTriangle aria-hidden="true" className="size-5" />
					</span>
				)}

				{consequence != null && (
					<p className="border-l-2 border-border pl-3 text-sm leading-relaxed font-medium">
						{consequence}
					</p>
				)}

				<p role="status" aria-live="polite" className="sr-only">
					{isPending ? 'Submitting. Waiting for the server to confirm.' : ''}
				</p>

				{state.status === 'failed' && (
					<p
						role="alert"
						className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/6 p-3 text-sm leading-relaxed text-danger"
					>
						<AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
						<span>{state.message}</span>
					</p>
				)}
			</Modal>

			<p role="status" aria-live="polite">
				{successMessage != null && state.status === 'committed' && (
					<span className="inline-flex items-start gap-2 text-sm leading-relaxed text-success">
						<CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
						{successMessage}
					</span>
				)}
			</p>
		</>
	)
}
