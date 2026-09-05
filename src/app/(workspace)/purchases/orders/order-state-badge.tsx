import { Ban, CheckCircle2, CircleDashed } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { PurchaseOrderState } from '@/lib/contracts/purchase-order'

const PRESENTATION: Record<
	PurchaseOrderState,
	{ label: string; tone: BadgeTone; icon: typeof Ban }
> = {
	DRAFT: { label: 'Draft', tone: 'neutral', icon: CircleDashed },
	CONFIRMED: { label: 'Confirmed', tone: 'success', icon: CheckCircle2 },
	CANCELLED: { label: 'Cancelled', tone: 'danger', icon: Ban }
}

export function OrderStateBadge({ state }: { state: PurchaseOrderState }) {
	const presentation = PRESENTATION[state]

	return (
		<Badge tone={presentation.tone} icon={presentation.icon}>
			{presentation.label}
		</Badge>
	)
}
