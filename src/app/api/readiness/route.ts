import { getPrisma } from '@/server/db/prisma'
import { getServerEnvironment } from '@/server/config/environment'

type CheckState = 'ok' | 'unavailable'

export async function GET() {
	const checks: Record<'database' | 'auth' | 'storage', CheckState> = {
		database: 'unavailable',
		auth: 'unavailable',
		storage: 'unavailable'
	}

	try {
		await getPrisma().$queryRaw`SELECT 1`
		checks.database = 'ok'
	} catch {}

	try {
		const environment = getServerEnvironment()
		const headers = { apikey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }
		const [auth, storage] = await Promise.all([
			fetch(`${environment.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
				headers,
				cache: 'no-store'
			}),
			fetch(`${environment.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/status`, {
				headers,
				cache: 'no-store'
			})
		])
		checks.auth = auth.ok ? 'ok' : 'unavailable'
		checks.storage = storage.ok ? 'ok' : 'unavailable'
	} catch {}

	const ready = Object.values(checks).every((check) => check === 'ok')

	return Response.json(
		{ status: ready ? 'ready' : 'unavailable', service: 'urbanledger', checks },
		{ status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
	)
}
