import type { ActionError, ApplicationErrorCode } from '@/lib/contracts/errors'

export class ApplicationError extends Error {
	readonly code: ApplicationErrorCode
	readonly fieldErrors?: Record<string, string[]>

	constructor(
		code: ApplicationErrorCode,
		message: string,
		fieldErrors?: Record<string, string[]>,
		options?: ErrorOptions
	) {
		super(message, options)
		this.name = 'ApplicationError'
		this.code = code
		this.fieldErrors = fieldErrors
	}

	toActionError(requestId?: string): ActionError {
		return {
			code: this.code,
			message: this.message,
			...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
			...(requestId ? { requestId } : {})
		}
	}
}
