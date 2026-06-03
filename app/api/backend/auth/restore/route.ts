import { NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { token?: unknown } | null
  const token = typeof payload?.token === 'string' ? payload.token.trim() : ''

  if (!token) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}/api/v1/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!backendResponse.ok) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(BACKEND_TOKEN_COOKIE, token, COOKIE_OPTIONS)
    return response
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 })
  }
}
