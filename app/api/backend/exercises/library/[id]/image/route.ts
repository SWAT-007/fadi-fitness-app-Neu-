import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { parseBackendJsonResponse, createProxyErrorId } from '@/app/api/backend/_lib/proxy'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = (await cookies()).get(BACKEND_TOKEN_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 })
  }

  // Validate content-type before reading body
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ ok: false, message: 'Ungültige Formulardaten' }, { status: 400 })
  }

  // Forward raw bytes + original Content-Type (preserves boundary, MIME types, filenames).
  // Re-serialising via request.formData() → fetch(body: FormData) changes the boundary and
  // may drop Content-Length, which causes type-is to return null and multer to skip parsing.
  let rawBody: ArrayBuffer
  try {
    rawBody = await request.arrayBuffer()
  } catch {
    return NextResponse.json({ ok: false, message: 'Ungültige Formulardaten' }, { status: 400 })
  }

  const path = `/api/v1/exercises/library/${id}/image`

  try {
    const backendResponse = await fetch(`${BACKEND_API_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body: rawBody,
      cache: 'no-store',
    })

    const payload = await parseBackendJsonResponse(backendResponse, { method: 'POST', path })
    return NextResponse.json(payload, { status: backendResponse.status })
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[bridge:exercises:library:image:post]', {
      errorId,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
