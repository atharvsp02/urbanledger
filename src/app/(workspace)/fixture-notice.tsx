import { Info } from 'lucide-react'

// Remove with src/server/dev-fixtures once the master-data service is published.
export function FixtureNotice({ children }: { children: React.ReactNode }) {
	return (
		<p className="flex max-w-3xl items-start gap-2 rounded-xl border border-border bg-surface-soft p-3 text-sm leading-relaxed text-muted-foreground">
			<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<span>{children}</span>
		</p>
	)
}
