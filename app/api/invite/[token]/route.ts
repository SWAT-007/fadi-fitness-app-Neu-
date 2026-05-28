import { NextResponse } from 'next/server'

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/v1/client-link-tokens/accept/${encodeURIComponent(token)}`,
      {
        method: 'GET',
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

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const body = await request.json().catch(() => null)

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/v1/client-link-tokens/accept/${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
