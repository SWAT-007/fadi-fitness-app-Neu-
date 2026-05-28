import { NextRequest, NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const errorResponse = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

export async function POST(request: NextRequest) {
  const backendToken = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value
  if (!backendToken) {
    return errorResponse('Nicht autorisiert.', 401)
  }

  const body = await request.json().catch(() => null) as { email?: unknown } | null
  const email = normalizeEmail(body?.email)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse('Ungueltige E-Mail-Adresse.', 400)
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/client-link-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${backendToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => null) as
      | { token?: unknown; expiresAt?: unknown; message?: unknown }
      | null

    if (!response.ok) {
      const message = typeof payload?.message === 'string'
        ? payload.message
        : 'Einladungslink konnte nicht erstellt werden.'
      return errorResponse(message, response.status)
    }

    if (typeof payload?.token !== 'string' || typeof payload?.expiresAt !== 'string') {
      return errorResponse('Ungueltige Antwort vom Backend.', 500)
    }

    return NextResponse.json({
      token: payload.token,
      expiresAt: payload.expiresAt,
    })
  } catch (error) {
    console.error('[admin/client-link-tokens] error:', error)
    return errorResponse('Interner Serverfehler.', 500)
  }
}
