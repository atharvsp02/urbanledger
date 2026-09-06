'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ContactAvatar } from '@/components/ui/placeholder'
import { firstFieldError } from '@/components/ui/action-errors'
import { cn } from '@/lib/cn'
import { saveContactImageAction } from '@/app/(workspace)/contacts/actions'

const MAXIMUM_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

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
	const inputRef = useRef<HTMLInputElement>(null)
	const previewRef = useRef<string | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
	const [clientError, setClientError] = useState<string | null>(null)
	const serverError =
		firstFieldError(state, 'image') ?? (state?.ok === false ? state.error.message : null)
	const confirmedImageUrl = state?.ok === true ? state.data.imageUrl : imageUrl
	const displayedImageUrl =
		isPending && previewUrl != null
			? previewUrl
			: state?.ok === false
				? previewUrl
				: confirmedImageUrl

	useEffect(
		() => () => {
			if (previewRef.current != null) URL.revokeObjectURL(previewRef.current)
		},
		[]
	)

	function selectImage(file: File | undefined) {
		setClientError(null)
		if (file == null) return

		if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
			setClientError('Use a JPEG, PNG or WebP image.')
			if (inputRef.current != null) inputRef.current.value = ''
			return
		}

		if (file.size > MAXIMUM_IMAGE_BYTES) {
			setClientError('Use an image of 5 MiB or less.')
			if (inputRef.current != null) inputRef.current.value = ''
			return
		}

		if (previewRef.current != null) URL.revokeObjectURL(previewRef.current)
		const nextPreviewUrl = URL.createObjectURL(file)
		previewRef.current = nextPreviewUrl
		setPreviewUrl(nextPreviewUrl)
		setSelectedFileName(file.name)
		formRef.current?.requestSubmit()
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-4">
				{displayedImageUrl == null ? (
					<ContactAvatar name={contactName} className="size-20" />
				) : (
					<Image
						src={displayedImageUrl}
						alt={`${contactName} profile image`}
						width={80}
						height={80}
						unoptimized
						className="size-20 shrink-0 rounded-full border border-border object-cover"
					/>
				)}

				{canEdit && (
					<div className="flex flex-wrap items-center gap-2">
						<form ref={formRef} action={formAction}>
							<input type="hidden" name="contactId" value={contactId} />
							<input type="hidden" name="intent" value="replace" />
							<label
								aria-disabled={isPending}
								className={cn(
									buttonVariants({ variant: 'secondary', size: 'sm' }),
									isPending ? 'pointer-events-none opacity-60' : 'cursor-pointer'
								)}
							>
								{isPending ? (
									<Loader2
										aria-hidden="true"
										className="size-4 animate-spin motion-reduce:animate-none"
									/>
								) : (
									<ImageUp aria-hidden="true" className="size-4" />
								)}
								{isPending ? 'Uploading' : confirmedImageUrl == null ? 'Add photo' : 'Change photo'}
								<input
									ref={inputRef}
									type="file"
									name="image"
									accept="image/jpeg,image/png,image/webp"
									disabled={isPending}
									className="sr-only"
									onChange={(event) => selectImage(event.target.files?.[0])}
								/>
							</label>
						</form>

						{confirmedImageUrl != null && (
							<form action={formAction}>
								<input type="hidden" name="contactId" value={contactId} />
								<input type="hidden" name="intent" value="remove" />
								<button
									type="submit"
									disabled={isPending}
									className={buttonVariants({ variant: 'ghost', size: 'sm' })}
								>
									<Trash2 aria-hidden="true" className="size-4" />
									Remove
								</button>
							</form>
						)}
					</div>
				)}
			</div>

			<div aria-live="polite" className="min-h-5 text-sm">
				{isPending && selectedFileName != null && (
					<p className="text-muted-foreground">Uploading {selectedFileName}.</p>
				)}
				{!isPending && clientError != null && <p className="text-danger">{clientError}</p>}
				{!isPending && clientError == null && serverError != null && (
					<p className="text-danger">{serverError}</p>
				)}
				{!isPending && clientError == null && state?.ok === true && (
					<p className="text-success">
						{state.data.imageUrl == null ? 'Photo removed.' : 'Photo updated.'}
					</p>
				)}
			</div>

			<p className="text-xs text-muted-foreground">
				JPEG, PNG or WebP up to 5 MiB. The photo is private and shown only to authorised users.
			</p>
		</div>
	)
}
