import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

async function proxyPeriodEntryMutation(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  method: 'PATCH' | 'DELETE',
) {
  const token = (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  const body = method === 'PATCH' ? await request.json().catch(() => null) : null
  if (method === 'PATCH' && (!body || typeof body !== 'object')) {
    return NextResponse.json({ ok: false, message: 'Invalid request body' }, { status: 400 })
  }

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/v1/me/period-entries/${encodeURIComponent(id)}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'PATCH' ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store',
      },
    )
    const payload = await backendResponse.json().catch(() => null)
    return NextResponse.json(
      payload ?? { ok: false, message: 'Invalid backend response' },
      { status: backendResponse.status, headers: NO_STORE_HEADERS },
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return proxyPeriodEntryMutation(request, context, 'PATCH')
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return proxyPeriodEntryMutation(request, context, 'DELETE')
}
