import type { ActionResult } from '@/lib/contracts/errors'
import type { FieldErrorEntry } from '@/components/ui/form-error-summary'

export function firstFieldError(
	state: ActionResult<unknown> | null,
	field: string
): string | undefined {
	if (state == null || state.ok) return undefined
	return state.error.fieldErrors?.[field]?.[0]
}

export function fieldErrorEntries(
	state: ActionResult<unknown> | null,
	idPrefix: string,
	labels: Record<string, string>
): readonly FieldErrorEntry[] {
	if (state == null || state.ok || !state.error.fieldErrors) return []

	return Object.entries(state.error.fieldErrors).flatMap(([field, messages]) =>
		messages[0] == null
			? []
			: [{ fieldId: `${idPrefix}-${field}`, label: labels[field] ?? field, message: messages[0] }]
	)
}
