import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getPublicEnvironment } from '@/lib/config/public-environment'

function safeNext(value: string | null) {
	return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

export async function GET(request: NextRequest) {
	const code = request.nextUrl.searchParams.get('code')
	const destination = safeNext(request.nextUrl.searchParams.get('next'))
	const response = NextResponse.redirect(new URL(destination, request.url))

	if (!code) {
		return NextResponse.redirect(new URL('/login?error=confirmation', request.url))
	}

	const environment = getPublicEnvironment()
	const supabase = createServerClient(
		environment.NEXT_PUBLIC_SUPABASE_URL,
		environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			cookies: {
				getAll: () => request.cookies.getAll(),
				setAll(cookiesToSet, headers) {
					cookiesToSet.forEach(({ name, value, options }) =>
						response.cookies.set(name, value, options)
					)
					Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
				}
			}
		}
	)
	const { error } = await supabase.auth.exchangeCodeForSession(code)

	return error ? NextResponse.redirect(new URL('/login?error=confirmation', request.url)) : response
}
