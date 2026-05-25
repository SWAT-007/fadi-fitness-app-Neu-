import { NextRequest, NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}/api/v1/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    const backendPayload = await backendResponse.json().catch(() => null) as {
      user?: unknown
      message?: unknown
    } | null

    if (!backendResponse.ok) {
      const message = typeof backendPayload?.message === 'string' ? backendPayload.message : 'Unauthorized'
      return NextResponse.json({ ok: false, message }, { status: backendResponse.status || 401 })
    }

    return NextResponse.json({ ok: true, user: backendPayload?.user ?? null })
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}

