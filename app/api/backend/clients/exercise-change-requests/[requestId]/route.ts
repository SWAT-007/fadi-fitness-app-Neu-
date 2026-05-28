import { NextRequest, NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

const getRequestId = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const token = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const params = await context.params
  const requestId = getRequestId(params.requestId)
  if (!requestId) {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, message: 'Invalid request' }, { status: 400 })
  }

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/v1/clients/exercise-change-requests/${requestId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      },
    )

    const payload = await backendResponse.json().catch(() => null)
    return NextResponse.json(
      payload ?? { ok: false, message: 'Invalid backend response' },
      { status: backendResponse.status },
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}
