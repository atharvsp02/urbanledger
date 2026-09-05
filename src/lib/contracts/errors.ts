export const applicationErrorCodes = [
	'VALIDATION_ERROR',
	'UNAUTHENTICATED',
	'FORBIDDEN',
	'NOT_FOUND',
	'CONFLICT',
	'STALE_REVISION',
	'INVALID_STATE',
	'ARCHIVED_DEPENDENCY',
	'LOCKED_PERIOD',
	'INSUFFICIENT_OUTSTANDING',
	'OPERATION_KEY_MISMATCH',
	'AUTH_UNAVAILABLE',
	'DATABASE_UNAVAILABLE',
	'STORAGE_UNAVAILABLE',
	'INTERNAL_ERROR'
] as const

export type ApplicationErrorCode = (typeof applicationErrorCodes)[number]

export type ActionError = {
	code: ApplicationErrorCode
	message: string
	fieldErrors?: Record<string, string[]>
	requestId?: string
}

export type ActionResult<T> =
	{ ok: true; data: T; requestId?: string } | { ok: false; error: ActionError }
