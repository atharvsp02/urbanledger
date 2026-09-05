import { z } from 'zod'
import { emailSchema, loginIdSchema, passwordSchema } from '@/lib/auth/credentials'

const identityFields = {
	displayName: z.string().trim().min(2).max(160),
	loginId: loginIdSchema,
	email: emailSchema,
	password: passwordSchema,
	passwordConfirmation: z.string()
} as const

export const createAdministratorInputSchema = z
	.object({ operationKey: z.uuid(), ...identityFields })
	.refine((input) => input.password === input.passwordConfirmation, {
		message: 'Passwords do not match.',
		path: ['passwordConfirmation']
	})

export const createContactUserInputSchema = z
	.object({
		operationKey: z.uuid(),
		contactId: z.uuid(),
		loginId: loginIdSchema,
		email: emailSchema,
		password: passwordSchema,
		passwordConfirmation: z.string()
	})
	.refine((input) => input.password === input.passwordConfirmation, {
		message: 'Passwords do not match.',
		path: ['passwordConfirmation']
	})

export const retryPortalProvisioningInputSchema = z
	.object({
		operationKey: z.uuid(),
		password: passwordSchema,
		passwordConfirmation: z.string()
	})
	.refine((input) => input.password === input.passwordConfirmation, {
		message: 'Passwords do not match.',
		path: ['passwordConfirmation']
	})

export const resolvePortalIdentityConflictInputSchema = z
	.object({
		conflictedOperationKey: z.uuid(),
		operationKey: z.uuid(),
		contactId: z.uuid(),
		loginId: loginIdSchema,
		email: emailSchema,
		password: passwordSchema,
		passwordConfirmation: z.string()
	})
	.refine((input) => input.password === input.passwordConfirmation, {
		message: 'Passwords do not match.',
		path: ['passwordConfirmation']
	})

export const identityMutationInputSchema = z.object({ operationKey: z.uuid(), userId: z.uuid() })
export const staffGrantMutationInputSchema = z.object({ operationKey: z.uuid(), grantId: z.uuid() })
export const portalAccessMutationInputSchema = z.object({
	operationKey: z.uuid(),
	portalAccessId: z.uuid()
})

export const accessUserSchema = z.object({
	id: z.uuid(),
	loginId: z.string(),
	identityEmail: z.string(),
	displayName: z.string(),
	status: z.enum(['PROVISIONING', 'ACTIVE', 'DISABLED']),
	mustChangePassword: z.boolean(),
	disabledAt: z.iso.datetime().nullable(),
	staffGrants: z.array(
		z.object({
			id: z.uuid(),
			role: z.enum(['ADMIN', 'ACCOUNTANT']),
			validFrom: z.iso.datetime(),
			validUntil: z.iso.datetime().nullable(),
			revokedAt: z.iso.datetime().nullable()
		})
	),
	portalAccess: z
		.object({
			id: z.uuid(),
			status: z.enum(['ACTIVE', 'REVOKED']),
			contact: z.object({ id: z.uuid(), name: z.string() }),
			revokedAt: z.iso.datetime().nullable()
		})
		.nullable(),
	createdAt: z.iso.datetime()
})

export const accessUserListInputSchema = z.object({
	page: z.number().int().positive().default(1),
	pageSize: z.number().int().min(1).max(100).default(20)
})

export const auditEventListInputSchema = z
	.object({
		action: z.string().trim().max(100).optional(),
		targetType: z.string().trim().max(80).optional(),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		page: z.number().int().positive().default(1),
		pageSize: z.number().int().min(1).max(100).default(20)
	})
	.refine((input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo, {
		message: 'The start date must not be after the end date.',
		path: ['dateTo']
	})

export const getAuditEventInputSchema = z.object({ auditEventId: z.uuid() })

export const auditEventSchema = z.object({
	id: z.uuid(),
	action: z.string(),
	targetType: z.string(),
	targetId: z.uuid(),
	requestId: z.uuid(),
	details: z.unknown().nullable(),
	actor: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
	occurredAt: z.iso.datetime()
})

export const accessMutationResultSchema = z.object({
	targetId: z.uuid(),
	status: z.enum(['DISABLED', 'ACTIVE', 'REVOKED'])
})

export type CreateAdministratorInput = z.input<typeof createAdministratorInputSchema>
export type CreateContactUserInput = z.input<typeof createContactUserInputSchema>
export type RetryPortalProvisioningInput = z.input<typeof retryPortalProvisioningInputSchema>
export type ResolvePortalIdentityConflictInput = z.input<
	typeof resolvePortalIdentityConflictInputSchema
>
export type IdentityMutationInput = z.input<typeof identityMutationInputSchema>
export type StaffGrantMutationInput = z.input<typeof staffGrantMutationInputSchema>
export type PortalAccessMutationInput = z.input<typeof portalAccessMutationInputSchema>
export type AccessUser = z.output<typeof accessUserSchema>
export type AccessUserListInput = z.input<typeof accessUserListInputSchema>
export type AuditEventListInput = z.input<typeof auditEventListInputSchema>
export type GetAuditEventInput = z.input<typeof getAuditEventInputSchema>
export type AuditEventDetail = z.output<typeof auditEventSchema>
export type AccessMutationResult = z.output<typeof accessMutationResultSchema>

export type AccessUserListResult = {
	rows: AccessUser[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}

export type AccessCreationOptions = {
	contacts: Array<{ id: string; name: string; kind: 'CUSTOMER' | 'VENDOR' | 'BOTH' }>
}

export type AuditEventListResult = {
	rows: AuditEventDetail[]
	totalCount: number
	page: number
	pageSize: number
	lastPage: number
}
