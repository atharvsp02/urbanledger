'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnvironment } from '@/lib/config/public-environment'

export function createBrowserSupabaseClient() {
	const environment = getPublicEnvironment()

	return createBrowserClient(
		environment.NEXT_PUBLIC_SUPABASE_URL,
		environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
	)
}
