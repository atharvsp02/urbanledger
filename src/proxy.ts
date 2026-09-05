import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { refreshSession } from '@/server/auth/session-proxy'

const protectedRoutes = [
	'/accounting',
	'/budgets',
	'/contacts',
	'/dashboard',
	'/payments',
	'/portal',
	'/products',
	'/purchases',
	'/reports',
	'/sales',
	'/settings',
	'/setup',
	'/stock'
]

export async function proxy(request: NextRequest) {
	let session

	try {
		session = await refreshSession(request)
	} catch {
		return NextResponse.next({ request })
	}

	const requiresAuthentication = protectedRoutes.some(
		(path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`)
	)

	if (requiresAuthentication && !session.authenticated) {
		const loginUrl = new URL('/login', request.url)
		loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
		return NextResponse.redirect(loginUrl)
	}

	return session.response
}

export const config = {
	matcher: ['/((?!_next/static|_next/image|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']
}
