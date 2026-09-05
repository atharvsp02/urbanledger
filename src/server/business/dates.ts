import 'server-only'
import { ApplicationError } from '@/server/errors/application-error'

export function currentBusinessDate(timezone: string, now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now)
	const values = new Map(parts.map((part) => [part.type, part.value]))
	return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

export function assertNotFutureBusinessDate(value: string, timezone: string, label: string) {
	if (value > currentBusinessDate(timezone)) {
		throw new ApplicationError('VALIDATION_ERROR', `${label} cannot be in the future.`)
	}
}
