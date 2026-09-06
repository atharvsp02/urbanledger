import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { PortalSettlementStatus } from '@/lib/contracts/portal'
import { isPositiveMoney } from '@/lib/money'

const SETTLEMENT: Record<PortalSettlementStatus, { label: string; tone: BadgeTone }> = {
	UNPAID: { label: 'Unpaid', tone: 'accent' },
	PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
	PAID: { label: 'Paid', tone: 'success' },
	REVERSED: { label: 'Reversed', tone: 'danger' }
}

export function PortalStatusBadge({
	status,
	overdueAmount
}: {
	status: PortalSettlementStatus
	overdueAmount: string
}) {
	const presentation = SETTLEMENT[status]
	const isOverdue = isPositiveMoney(overdueAmount) && status !== 'PAID' && status !== 'REVERSED'

	return (
		<span className="inline-flex flex-wrap items-center gap-2">
			<Badge tone={presentation.tone}>{presentation.label}</Badge>
			{isOverdue && <Badge tone="danger">Overdue</Badge>}
		</span>
	)
}

export function PortalPaymentStatusBadge({ status }: { status: 'POSTED' | 'REVERSED' }) {
	return status === 'POSTED' ? (
		<Badge tone="success">Recorded</Badge>
	) : (
		<Badge tone="danger">Reversed</Badge>
	)
}
