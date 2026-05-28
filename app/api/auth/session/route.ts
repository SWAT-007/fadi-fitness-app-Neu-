import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

const sessionError = (message: string, status: number) =>
  NextResponse.json({ ok: false, message }, { status })

export async function POST() {
  const backendToken = (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value
  if (!backendToken) {
    return sessionError('Admin-Sitzung konnte nicht erstellt werden: Zugriffstoken fehlt.', 401)
  }

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}/api/v1/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${backendToken}` },
      cache: 'no-store',
    })

    const backendPayload = await backendResponse.json().catch(() => null) as {
      user?: { role?: unknown }
      message?: unknown
    } | null

    if (!backendResponse.ok) {
      const message = typeof backendPayload?.message === 'string'
        ? backendPayload.message
        : 'Admin-Sitzung konnte nicht validiert werden.'
      return sessionError(message, backendResponse.status || 401)
    }

    const role = typeof backendPayload?.user?.role === 'string'
      ? backendPayload.user.role.toLowerCase()
      : ''

    if (role !== 'trainer') {
      return sessionError('Admin-Zugriff ist fuer dieses Konto nicht erlaubt.', 403)
    }
  } catch {
    return sessionError('Backend nicht erreichbar.', 502)
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(BACKEND_TOKEN_COOKIE, backendToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60,
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(BACKEND_TOKEN_COOKIE, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  })

  return response
}
