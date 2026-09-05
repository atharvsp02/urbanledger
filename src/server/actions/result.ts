import 'server-only'
import { ZodError } from 'zod'
import type { ActionResult } from '@/lib/contracts/errors'
import { ApplicationError } from '@/server/errors/application-error'

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
	const fieldErrors: Record<string, string[]> = {}

	for (const issue of error.issues) {
		const path = issue.path.join('.') || 'form'
		fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message]
	}

	return fieldErrors
}

// Every server action returns the shared result contract, so the UI reacts to
// stable error codes rather than parsing messages.
export async function toActionResult<T>(run: () => Promise<T> | T): Promise<ActionResult<T>> {
	try {
		return { ok: true, data: await run() }
	} catch (error) {
		if (error instanceof ZodError) {
			return {
				ok: false,
				error: {
					code: 'VALIDATION_ERROR',
					message: 'Check the highlighted fields.',
					fieldErrors: fieldErrorsFrom(error)
				}
			}
		}

		if (error instanceof ApplicationError) {
			return { ok: false, error: error.toActionError() }
		}

		throw error
	}
}
