import { z } from 'zod'
import { emailSchema, loginIdSchema, passwordSchema } from '@/lib/auth/credentials'

export const contactAccessInputSchema = z
	.object({
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

export type ContactAccessInput = z.input<typeof contactAccessInputSchema>
export type ContactAccessResult = { contactId: string; loginId: string }
