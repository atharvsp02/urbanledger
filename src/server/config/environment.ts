import 'server-only'
import { z } from 'zod'
import { publicEnvironmentSchema } from '@/lib/config/public-environment'

const serverEnvironmentSchema = publicEnvironmentSchema.extend({
	URBANLEDGER_ENV: z.enum(['local', 'hosted']).default('local'),
	APP_URL: z.url().default('http://127.0.0.1:3000'),
	DATABASE_URL: z.string().min(1),
	DIRECT_URL: z.string().min(1),
	SUPABASE_SECRET_KEY: z.string().min(20),
	SUPABASE_STORAGE_BUCKET: z.string().min(1).default('contact-images')
})

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>

let cachedServerEnvironment: ServerEnvironment | undefined

function isLoopback(url: string) {
	const hostname = new URL(url).hostname
	return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

export function getServerEnvironment() {
	if (cachedServerEnvironment) {
		return cachedServerEnvironment
	}

	const environment = serverEnvironmentSchema.parse(process.env)

	if (environment.URBANLEDGER_ENV === 'local') {
		const localUrls = [
			environment.APP_URL,
			environment.DATABASE_URL,
			environment.DIRECT_URL,
			environment.NEXT_PUBLIC_SUPABASE_URL
		]

		if (localUrls.some((url) => !isLoopback(url))) {
			throw new Error('Local mode requires loopback-only application and service URLs.')
		}
	}

	if (environment.URBANLEDGER_ENV === 'hosted') {
		if (!environment.APP_URL.startsWith('https://')) {
			throw new Error('Hosted mode requires an HTTPS application URL.')
		}

		if (isLoopback(environment.NEXT_PUBLIC_SUPABASE_URL)) {
			throw new Error('Hosted mode cannot use the local Supabase endpoint.')
		}
	}

	cachedServerEnvironment = environment
	return environment
}
