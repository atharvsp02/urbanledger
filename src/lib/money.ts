const MONEY_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/

function toMinorUnits(value: string): bigint {
	const match = MONEY_PATTERN.exec(value)
	if (match == null) throw new Error('Expected an amount with at most two decimal places')

	const isNegative = value.startsWith('-')
	const unsigned = isNegative ? value.slice(1) : value
	const [whole, fraction = ''] = unsigned.split('.')
	const units = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))
	return isNegative ? -units : units
}

function fromMinorUnits(units: bigint): string {
	const isNegative = units < BigInt(0)
	const absolute = isNegative ? -units : units
	const whole = absolute / BigInt(100)
	const fraction = String(absolute % BigInt(100)).padStart(2, '0')
	return `${isNegative ? '-' : ''}${whole}.${fraction}`
}

export function normalizeMoney(value: string): string {
	return fromMinorUnits(toMinorUnits(value))
}

export function subtractMoney(minuend: string, subtrahend: string): string {
	return fromMinorUnits(toMinorUnits(minuend) - toMinorUnits(subtrahend))
}

export function addMoney(...values: readonly string[]): string {
	return fromMinorUnits(values.reduce((sum, value) => sum + toMinorUnits(value), BigInt(0)))
}

export function isPositiveMoney(value: string): boolean {
	return toMinorUnits(value) > BigInt(0)
}

export function isNegativeMoney(value: string): boolean {
	return toMinorUnits(value) < BigInt(0)
}
