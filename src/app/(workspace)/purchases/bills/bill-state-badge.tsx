import { Ban, CheckCircle2, CircleDashed } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { VendorBillState } from '@/lib/contracts/vendor-bill'

const PRESENTATION: Record<VendorBillState, { label: string; tone: BadgeTone; icon: typeof Ban }> =
	{
		DRAFT: { label: 'Draft', tone: 'neutral', icon: CircleDashed },
		POSTED: { label: 'Posted', tone: 'success', icon: CheckCircle2 },
		CANCELLED: { label: 'Cancelled', tone: 'danger', icon: Ban }
	}

export function BillStateBadge({ state }: { state: VendorBillState }) {
	const presentation = PRESENTATION[state]

	return (
		<Badge tone={presentation.tone} icon={presentation.icon}>
			{presentation.label}
		</Badge>
	)
}
