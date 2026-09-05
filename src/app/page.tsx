export default function HomePage() {
	return (
		<main
			id="main-content"
			tabIndex={-1}
			className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-6 py-16 sm:px-10"
		>
			<p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
				Accounting workspace
			</p>
			<h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">UrbanLedger</h1>
			<p className="mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl">
				Purchases, sales, and payments. One clear set of books.
			</p>
			<section
				aria-labelledby="setup-heading"
				className="mt-10 rounded-2xl border border-border bg-surface p-6 sm:p-8"
			>
				<h2 id="setup-heading" className="text-lg font-semibold">
					Initial setup
				</h2>
				<p className="mt-2 text-base text-muted-foreground">
					The application foundation is running. Account access, business data, and accounting
					features are not connected yet.
				</p>
				<a
					href="/api/health"
					className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 motion-reduce:transition-none"
				>
					Check application health
				</a>
			</section>
		</main>
	)
}
