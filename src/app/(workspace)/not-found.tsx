import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { NotFoundState } from '@/components/ui/state-panel'

export default function WorkspaceNotFound() {
	return (
		<NotFoundState
			titleAs="h1"
			description="This record does not exist, or the address is wrong. It may have been removed."
		>
			<Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
				Back to dashboard
			</Link>
		</NotFoundState>
	)
}
