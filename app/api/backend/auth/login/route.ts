import { NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60,
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as {
    email?: unknown
    password?: unknown
  } | null

  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const password = typeof payload?.password === 'string' ? payload.password : ''

  if (!email || !password) {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    })

    const backendPayload = await backendResponse.json().catch(() => null) as {
      token?: unknown
      message?: unknown
    } | null

    const token = typeof backendPayload?.token === 'string' ? backendPayload.token : ''
    if (!backendResponse.ok || !token) {
      const message = typeof backendPayload?.message === 'string' ? backendPayload.message : 'Unauthorized'
      return NextResponse.json({ ok: false, message }, { status: backendResponse.status || 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(BACKEND_TOKEN_COOKIE, token, COOKIE_OPTIONS)
    return response
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}

