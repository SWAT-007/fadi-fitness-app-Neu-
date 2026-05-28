import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function getBackendToken() {
  return (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value ?? null
}

export async function proxyBackendJson({
  method,
  path,
}: {
  method: 'GET' | 'PATCH'
  path: string
}) {
  const token = await getBackendToken()
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    const payload = await backendResponse.json().catch(() => null)
    return NextResponse.json(
      payload ?? { ok: false, message: 'Invalid backend response' },
      { status: backendResponse.status },
    )
  } catch {
    return NextResponse.json({ ok: false, message: 'Backend unavailable' }, { status: 502 })
  }
}
