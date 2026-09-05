import type { ReactNode } from 'react'
import Link from 'next/link'

export function AuthCard({
	title,
	description,
	children
}: {
	title: string
	description: string
	children: ReactNode
}) {
	return (
		<main
			id="main-content"
			className="mx-auto flex min-h-dvh w-full max-w-md items-center px-6 py-12"
		>
			<section className="w-full rounded-2xl border border-border bg-surface p-7 shadow-sm">
				<Link href="/" className="text-sm font-semibold tracking-wide text-accent">
					UrbanLedger
				</Link>
				<h1 className="mt-5 text-3xl font-semibold tracking-tight">{title}</h1>
				<p className="mt-2 text-sm text-muted-foreground">{description}</p>
				<div className="mt-7">{children}</div>
			</section>
		</main>
	)
}
