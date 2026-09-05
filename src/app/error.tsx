'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/state-panel'

export default function AppError({ reset }: { error: Error; reset: () => void }) {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-16"
		>
			<ErrorState
				title="Something went wrong"
				titleAs="h1"
				description="This screen did not finish loading, so nothing here is showing business data. Try again, or go back to the workspace."
			>
				<button type="button" onClick={reset} className={buttonVariants({ size: 'sm' })}>
					Try again
				</button>
				<Link href="/" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
					Back to workspace
				</Link>
			</ErrorState>
		</main>
	)
}
