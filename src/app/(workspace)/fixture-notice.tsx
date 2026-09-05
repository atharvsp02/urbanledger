import { Info } from 'lucide-react'

const MESSAGES = {
	contacts:
		'Contacts are held in temporary local data. They are not stored in the database yet, so records do not survive a server restart.',
	products:
		'Products are held in temporary local data. They are not stored in the database yet, so records do not survive a server restart.'
} as const

// Remove with src/server/dev-fixtures once the master-data service is published.
export function FixtureNotice({ master }: { master: keyof typeof MESSAGES }) {
	return (
		<p className="flex items-start gap-2 rounded-xl border border-border bg-surface-soft p-3 text-sm leading-relaxed text-muted-foreground">
			<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<span>{MESSAGES[master]}</span>
		</p>
	)
}
