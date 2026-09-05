import { Ban, CheckCircle2, CircleDashed } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'

type SalesOrderState = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'

const PRESENTATION: Record<SalesOrderState, { label: string; tone: BadgeTone; icon: typeof Ban }> =
	{
		DRAFT: { label: 'Draft', tone: 'neutral', icon: CircleDashed },
		CONFIRMED: { label: 'Confirmed', tone: 'success', icon: CheckCircle2 },
		CANCELLED: { label: 'Cancelled', tone: 'danger', icon: Ban }
	}

export function SalesOrderStateBadge({ state }: { state: SalesOrderState }) {
	const presentation = PRESENTATION[state]

	return (
		<Badge tone={presentation.tone} icon={presentation.icon}>
			{presentation.label}
		</Badge>
	)
}
