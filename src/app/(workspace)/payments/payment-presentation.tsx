import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Undo2 } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type {
	paymentDirections,
	paymentStatuses,
	settlementStatuses
} from '@/lib/contracts/payment'

type Direction = (typeof paymentDirections)[number]
type Status = (typeof paymentStatuses)[number]
type Settlement = (typeof settlementStatuses)[number]

export const DIRECTION_LABELS: Record<Direction, string> = {
	CUSTOMER_INCOMING: 'Incoming',
	VENDOR_OUTGOING: 'Outgoing'
}

export function PaymentDirectionBadge({ direction }: { direction: Direction }) {
	return direction === 'CUSTOMER_INCOMING' ? (
		<Badge tone="success" icon={ArrowDownLeft}>
			Incoming
		</Badge>
	) : (
		<Badge tone="warning" icon={ArrowUpRight}>
			Outgoing
		</Badge>
	)
}

export function PaymentStatusBadge({ status }: { status: Status }) {
	return status === 'POSTED' ? (
		<Badge tone="success" icon={CheckCircle2}>
			Posted
		</Badge>
	) : (
		<Badge tone="danger" icon={Undo2}>
			Reversed
		</Badge>
	)
}

const SETTLEMENT: Record<Settlement, { label: string; tone: BadgeTone }> = {
	UNPAID: { label: 'Unpaid', tone: 'accent' },
	PARTIALLY_PAID: { label: 'Partially paid', tone: 'warning' },
	PAID: { label: 'Paid', tone: 'success' },
	REVERSED: { label: 'Reversed', tone: 'danger' }
}

export function SettlementBadge({
	status,
	isOverdue = false
}: {
	status: Settlement
	isOverdue?: boolean
}) {
	const presentation = SETTLEMENT[status]

	return (
		<span className="inline-flex flex-wrap items-center gap-2">
			<Badge tone={presentation.tone}>{presentation.label}</Badge>
			{isOverdue && status !== 'PAID' && status !== 'REVERSED' && (
				<Badge tone="danger">Overdue</Badge>
			)}
		</span>
	)
}
