import 'server-only'
import type { Prisma } from '@/generated/prisma/client'

// Prisma Decimal keeps the column scale; the UI receives the exact string so no
// value passes through binary floating point.
export function decimalToString(value: Prisma.Decimal): string {
	return value.toFixed(4)
}
