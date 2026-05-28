import { NextRequest, NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.toString()

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/v1/clients/exercise-change-requests${query ? `?${query}` : ''}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
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
