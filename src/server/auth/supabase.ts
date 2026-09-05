import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getServerEnvironment } from '@/server/config/environment'

export async function createServerSupabaseClient() {
	const environment = getServerEnvironment()
	const cookieStore = await cookies()

	return createServerClient(
		environment.NEXT_PUBLIC_SUPABASE_URL,
		environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			cookies: {
				getAll: () => cookieStore.getAll(),
				setAll(cookiesToSet) {
					try {
						cookiesToSet.forEach(({ name, value, options }) =>
							cookieStore.set(name, value, options)
						)
					} catch {}
				}
			}
		}
	)
}

export function createAdminSupabaseClient() {
	const environment = getServerEnvironment()

	return createClient(environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_SECRET_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}
