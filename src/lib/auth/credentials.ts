import { z } from 'zod'

export const loginIdSchema = z
	.string()
	.trim()
	.min(6, 'Login ID must contain at least 6 characters.')
	.max(12, 'Login ID must contain at most 12 characters.')
	.regex(/^[A-Za-z0-9._-]+$/, 'Login ID may use letters, numbers, dots, underscores and hyphens.')

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email('Enter a valid email address.'))

export const passwordSchema = z
	.string()
	.min(9, 'Password must be longer than 8 characters.')
	.regex(/[a-z]/, 'Password must contain a lowercase letter.')
	.regex(/[A-Z]/, 'Password must contain an uppercase letter.')
	.regex(/[^\p{L}\p{N}\s]/u, 'Password must contain a special character.')

export function normalizeLoginId(loginId: string) {
	return loginId.trim().toLowerCase()
}

export function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}
