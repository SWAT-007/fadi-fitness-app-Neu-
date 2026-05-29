import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createProxyErrorId } from '@/app/api/backend/_lib/proxy'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ checkinId: string }> },
) {
  const token = (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { checkinId } = await params

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid form data' }, { status: 400 })
  }

  try {
    const backendResponse = await fetch(
      `${BACKEND_API_URL}/api/v1/me/checkins/${checkinId}/images`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        cache: 'no-store',
      },
    )
    const payload = await backendResponse.json().catch(() => null)
    return NextResponse.json(
      payload ?? { ok: false, message: 'Invalid backend response' },
      { status: backendResponse.status },
    )
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:me:checkins:images:post]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
