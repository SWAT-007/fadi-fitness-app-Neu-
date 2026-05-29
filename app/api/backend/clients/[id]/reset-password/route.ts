import { NextRequest, NextResponse } from 'next/server'
import { createProxyErrorId, parseBackendJsonResponse } from '@/app/api/backend/_lib/proxy'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const getClientId = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const id = getClientId(params.id)
  if (!id) {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  try {
    const backendPath = `/api/v1/clients/${id}/reset-password`
    const backendResponse = await fetch(`${BACKEND_API_URL}${backendPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const payload = await parseBackendJsonResponse(backendResponse, { method: 'POST', path: backendPath })

    return NextResponse.json(
      payload,
      { status: backendResponse.status },
    )
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:clients:reset-password]', {
      errorId,
      path: `/api/v1/clients/${id}/reset-password`,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
