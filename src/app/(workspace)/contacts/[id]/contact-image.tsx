'use client'

import { useActionState, useRef } from 'react'
import Image from 'next/image'
import { Loader2, Upload } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ContactAvatar } from '@/components/ui/placeholder'
import { firstFieldError } from '@/components/ui/action-errors'
import { saveContactImageAction } from '@/app/(workspace)/contacts/actions'

export function ContactImage({
	contactId,
	contactName,
	imageUrl,
	canEdit
}: {
	contactId: string
	contactName: string
	imageUrl: string | null
	canEdit: boolean
}) {
	const [state, formAction, isPending] = useActionState(saveContactImageAction, null)
	const formRef = useRef<HTMLFormElement>(null)
	const error =
		firstFieldError(state, 'image') ?? (state?.ok === false ? state.error.message : null)

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-4">
				{imageUrl == null ? (
					<ContactAvatar name={contactName} className="size-16" />
				) : (
					<Image
						src={imageUrl}
						alt={`${contactName} profile image`}
						width={64}
						height={64}
						unoptimized
						className="size-16 shrink-0 rounded-full border border-border object-cover"
					/>
				)}

				{canEdit && (
					<form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
						<input type="hidden" name="contactId" value={contactId} />
						<input type="hidden" name="intent" value="replace" />
						<label
							className={buttonVariants({
								variant: 'secondary',
								size: 'sm',
								className: 'cursor-pointer'
							})}
						>
							<Upload aria-hidden="true" className="size-4" />
							{imageUrl == null ? 'Upload image' : 'Replace image'}
							<input
								type="file"
								name="image"
								accept="image/jpeg,image/png,image/webp"
								className="sr-only"
								onChange={() => formRef.current?.requestSubmit()}
							/>
						</label>
						{isPending && (
							<Loader2
								aria-hidden="true"
								className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
							/>
						)}
					</form>
				)}

				{canEdit && imageUrl != null && (
					<form action={formAction}>
						<input type="hidden" name="contactId" value={contactId} />
						<input type="hidden" name="intent" value="remove" />
						<button
							type="submit"
							disabled={isPending}
							className={buttonVariants({ variant: 'ghost', size: 'sm' })}
						>
							Remove
						</button>
					</form>
				)}
			</div>

			<p role="status" aria-live="polite" className="text-sm">
				{isPending && <span className="text-muted-foreground">Uploading and verifying.</span>}
				{error != null && !isPending && <span className="text-danger">{error}</span>}
			</p>

			<p className="text-xs text-muted-foreground">
				JPEG, PNG or WebP up to 5 MiB. Images are stored privately and served through short-lived
				links.
			</p>
		</div>
	)
}
