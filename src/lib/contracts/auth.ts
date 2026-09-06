import { z } from 'zod'
import { emailSchema, loginIdSchema, passwordSchema } from '@/lib/auth/credentials'

export const loginInputSchema = z.object({
	loginId: loginIdSchema,
	password: z.string().min(1),
	returnTo: z.string().optional()
})

export const signupInputSchema = z
	.object({
		operationKey: z.uuid(),
		displayName: z.string().trim().min(2).max(160),
		loginId: loginIdSchema,
		email: emailSchema,
		password: passwordSchema,
		passwordConfirmation: z.string()
	})
	.refine((input) => input.password === input.passwordConfirmation, {
		message: 'Passwords do not match.',
		path: ['passwordConfirmation']
	})

export const passwordRecoveryInputSchema = z
	.object({ password: passwordSchema, passwordConfirmation: z.string() })
	.refine((input) => input.password === input.passwordConfirmation, {
		message: 'Passwords do not match.',
		path: ['passwordConfirmation']
	})

export type LoginInput = z.input<typeof loginInputSchema>
export type SignupInput = z.input<typeof signupInputSchema>
export type PasswordRecoveryInput = z.input<typeof passwordRecoveryInputSchema>

export type LoginResult = {
	redirectTo: '/dashboard' | '/portal' | '/access-denied' | '/change-password'
}
export type SignupResult = { loginId: string; confirmationRequired: true }
