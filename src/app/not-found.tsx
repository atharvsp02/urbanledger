import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { NotFoundState } from '@/components/ui/state-panel'

export default function NotFound() {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-16"
		>
			<NotFoundState
				title="Page not found"
				titleAs="h1"
				description="This page does not exist. Return to the workspace to continue."
			>
				<Link href="/" className={buttonVariants({ size: 'sm' })}>
					Back to workspace
				</Link>
			</NotFoundState>
		</main>
	)
}
