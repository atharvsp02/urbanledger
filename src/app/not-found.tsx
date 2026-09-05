import Link from 'next/link'

export default function NotFound() {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-6 py-16 sm:px-10"
		>
			<p className="text-sm font-semibold text-muted-foreground">404</p>
			<h1 className="mt-4 text-3xl font-semibold tracking-tight">Page not found</h1>
			<p className="mt-4 text-base text-muted-foreground">
				This page does not exist. Return to the workspace to continue.
			</p>
			<Link
				href="/"
				className="mt-6 inline-flex min-h-11 w-fit items-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 motion-reduce:transition-none"
			>
				Back to workspace
			</Link>
		</main>
	)
}
