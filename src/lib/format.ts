const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
] as const

// Indian digit grouping: the last three digits, then pairs.
function groupIndian(digits: string): string {
	if (digits.length <= 3) return digits
	const head = digits.slice(0, -3)
	const tail = digits.slice(-3)
	const groupedHead = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
	return `${groupedHead},${tail}`
}

// Amounts stay decimal strings so no value passes through binary floating point.
export function formatAmount(
	amount: string,
	options: { currencySymbol?: string; minimumFractionDigits?: number } = {}
): string {
	const { currencySymbol = '₹', minimumFractionDigits = 2 } = options
	if (!DECIMAL_PATTERN.test(amount)) throw new Error('formatAmount expects a decimal string')

	const isNegative = amount.startsWith('-')
	const unsigned = isNegative ? amount.slice(1) : amount
	const [whole, fraction = ''] = unsigned.split('.')
	const paddedFraction = fraction.padEnd(minimumFractionDigits, '0')
	const body =
		paddedFraction.length > 0 ? `${groupIndian(whole)}.${paddedFraction}` : groupIndian(whole)

	return `${isNegative ? '-' : ''}${currencySymbol}${body}`
}

export function formatQuantity(quantity: string, options: { maximumTrailingZeros?: boolean } = {}) {
	if (!DECIMAL_PATTERN.test(quantity)) throw new Error('formatQuantity expects a decimal string')
	if (options.maximumTrailingZeros === true) return quantity

	const [whole, fraction = ''] = quantity.split('.')
	const trimmed = fraction.replace(/0+$/, '')
	return trimmed.length > 0 ? `${whole}.${trimmed}` : whole
}

// Business dates are date-only values. Splitting the string keeps the day the
// server issued; constructing a Date would reinterpret it in another zone.
export function formatBusinessDate(date: string): string {
	const parts = DATE_PATTERN.exec(date)
	if (parts == null) throw new Error('formatBusinessDate expects a YYYY-MM-DD string')

	const [, year, month, day] = parts
	const monthLabel = MONTHS[Number(month) - 1]
	if (monthLabel == null) throw new Error('formatBusinessDate received an out-of-range month')
	return `${day} ${monthLabel} ${year}`
}

// Canonical amounts arrive at the column scale; display keeps at least two
// decimals and drops the padding beyond them.
export function trimMoneyScale(amount: string, minimumFractionDigits = 2): string {
	if (!DECIMAL_PATTERN.test(amount)) throw new Error('trimMoneyScale expects a decimal string')
	if (!amount.includes('.')) return amount

	const [whole, fraction] = amount.split('.')
	const trimmed = fraction.replace(/0+$/, '').padEnd(minimumFractionDigits, '0')
	return trimmed.length === 0 ? whole : `${whole}.${trimmed}`
}
