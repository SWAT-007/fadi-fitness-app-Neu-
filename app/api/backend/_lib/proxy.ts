import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? 'http://localhost:4000'
const IS_DEV = process.env.NODE_ENV !== 'production'

export const createProxyErrorId = (): string => {
  const now = new Date()
  const datePart = [
    now.getUTCFullYear().toString(),
    (now.getUTCMonth() + 1).toString().padStart(2, '0'),
    now.getUTCDate().toString().padStart(2, '0'),
  ].join('')
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ERR-${datePart}-${randomPart}`
}

export const invalidBackendResponsePayload = (errorId: string, rawText?: string) => ({
  ok: false,
  message: 'Ungueltige Backend-Antwort.',
  errorId,
  ...(IS_DEV && rawText ? { details: rawText } : {}),
})

export const parseBackendJsonResponse = async (
  backendResponse: Response,
  context: { method: string; path: string },
) => {
  const contentType = backendResponse.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = await backendResponse.json().catch(() => null)
    if (payload) return payload
  }

  const rawText = await backendResponse.text().catch(() => '')
  const errorId = createProxyErrorId()
  console.error('[backend-proxy:invalid-response]', {
    errorId,
    method: context.method,
    path: context.path,
    status: backendResponse.status,
    contentType,
    rawText: rawText || undefined,
  })
  return invalidBackendResponsePayload(errorId, rawText)
}

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

    const payload = await parseBackendJsonResponse(backendResponse, { method, path })
    return NextResponse.json(
      payload,
      { status: backendResponse.status },
    )
  } catch (error) {
    const errorId = createProxyErrorId()
    console.error('[backend-proxy:fetch-failed]', {
      errorId,
      method,
      path,
      message: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, message: 'Backend unavailable', errorId }, { status: 502 })
  }
}
