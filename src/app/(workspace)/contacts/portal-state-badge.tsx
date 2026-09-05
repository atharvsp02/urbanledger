import { CheckCircle2, CircleDashed, Clock, ShieldOff, TriangleAlert } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { ContactPortalState } from '@/lib/masters/contact'

const PRESENTATION: Record<
	ContactPortalState,
	{ label: string; tone: BadgeTone; icon: typeof Clock }
> = {
	none: { label: 'Not enabled', tone: 'neutral', icon: CircleDashed },
	pending: { label: 'Pending', tone: 'accent', icon: Clock },
	active: { label: 'Active', tone: 'success', icon: CheckCircle2 },
	failed: { label: 'Failed', tone: 'danger', icon: TriangleAlert },
	revoked: { label: 'Revoked', tone: 'warning', icon: ShieldOff }
}

export function PortalStateBadge({ state }: { state: ContactPortalState }) {
	const presentation = PRESENTATION[state]

	return (
		<Badge tone={presentation.tone} icon={presentation.icon}>
			{presentation.label}
		</Badge>
	)
}
