export type FieldErrors = Partial<Record<string, string>>

export type MasterFormState = {
	status: 'idle' | 'invalid' | 'failed'
	errors: FieldErrors
	message?: string
}

export const emptyMasterFormState: MasterFormState = { status: 'idle', errors: {} }
