import { z } from 'zod'

export const publicEnvironmentSchema = z.object({
	NEXT_PUBLIC_SUPABASE_URL: z.url(),
	NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20)
})

export function getPublicEnvironment() {
	return publicEnvironmentSchema.parse({
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
	})
}
