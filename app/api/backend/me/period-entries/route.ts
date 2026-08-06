import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: NextRequest) {
  const token = (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const query = new URL(request.url).searchParams.toString()
  const path = `/api/v1/me/period-entries${query ? `?${query}` : ''}`

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await backendResponse.json().catch(() => null)
    return NextResponse.json(
      payload ?? { ok: false, message: 'Invalid backend response' },
      { status: backendResponse.status, headers: NO_STORE_HEADERS },
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  const token = (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, message: 'Invalid request body' }, { status: 400 })
  }

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}/api/v1/me/period-entries`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const payload = await backendResponse.json().catch(() => null)
    return NextResponse.json(
      payload ?? { ok: false, message: 'Invalid backend response' },
      { status: backendResponse.status, headers: NO_STORE_HEADERS },
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}
