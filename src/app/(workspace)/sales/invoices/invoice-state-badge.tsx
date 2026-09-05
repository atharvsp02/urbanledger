import { Ban, CheckCircle2, CircleDashed } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { customerInvoiceStates } from '@/lib/contracts/customer-invoice'

type InvoiceState = (typeof customerInvoiceStates)[number]

const PRESENTATION: Record<InvoiceState, { label: string; tone: BadgeTone; icon: typeof Ban }> = {
	DRAFT: { label: 'Draft', tone: 'neutral', icon: CircleDashed },
	POSTED: { label: 'Posted', tone: 'success', icon: CheckCircle2 },
	CANCELLED: { label: 'Cancelled', tone: 'danger', icon: Ban }
}

export function InvoiceStateBadge({ state }: { state: InvoiceState }) {
	const presentation = PRESENTATION[state]

	return (
		<Badge tone={presentation.tone} icon={presentation.icon}>
			{presentation.label}
		</Badge>
	)
}
