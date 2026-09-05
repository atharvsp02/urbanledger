import type {
	BalanceDirection,
	JournalEntrySource,
	JournalEntryStatus
} from '@/lib/contracts/accounting'

export const JOURNAL_ENTRY_SOURCE_LABELS: Record<JournalEntrySource, string> = {
	OPENING: 'Opening',
	MANUAL: 'Manual',
	CUSTOMER_INVOICE: 'Customer invoice',
	VENDOR_BILL: 'Vendor bill',
	CUSTOMER_PAYMENT: 'Customer payment',
	VENDOR_PAYMENT: 'Vendor payment',
	REVERSAL: 'Reversal'
}

export const JOURNAL_ENTRY_STATUS_LABELS: Record<JournalEntryStatus, string> = {
	DRAFT: 'Draft',
	POSTED: 'Posted',
	REVERSED: 'Reversed',
	REVERSAL: 'Reversal'
}

export const BALANCE_DIRECTION_LABELS: Record<BalanceDirection, string> = {
	DR: 'Dr',
	CR: 'Cr',
	ZERO: 'Zero'
}

export function signedBalance(value: string): {
	amount: string
	direction: BalanceDirection
} {
	if (!/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
		throw new Error('signedBalance expects a canonical decimal string')
	}

	if (/^-?0\.00$/.test(value)) return { amount: '0.00', direction: 'ZERO' }
	if (value.startsWith('-')) return { amount: value.slice(1), direction: 'CR' }
	return { amount: value, direction: 'DR' }
}
