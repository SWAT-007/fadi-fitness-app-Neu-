import { NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, isAdminEmail, getEmailFromJwt } from '@/lib/admin'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

const sessionError = (message: string, status: number) =>
  NextResponse.json({ ok: false, message }, { status })

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as {
    accessToken?: unknown
    access_token?: unknown
    expiresAt?: unknown
    expires_at?: unknown
    session?: {
      access_token?: unknown
      expires_at?: unknown
    }
  } | null

  const accessToken =
    typeof payload?.accessToken === 'string' ? payload.accessToken :
      typeof payload?.access_token === 'string' ? payload.access_token :
        typeof payload?.session?.access_token === 'string' ? payload.session.access_token :
          ''

  const expiresAt =
    typeof payload?.expiresAt === 'number' ? payload.expiresAt :
      typeof payload?.expires_at === 'number' ? payload.expires_at :
        typeof payload?.session?.expires_at === 'number' ? payload.session.expires_at :
          null

  if (!accessToken) {
    return sessionError('Admin-Sitzung konnte nicht erstellt werden: Zugriffstoken fehlt.', 400)
  }

  const email = getEmailFromJwt(accessToken)
  if (!isAdminEmail(email)) {
    return sessionError('Admin-Zugriff ist für diese E-Mail-Adresse nicht erlaubt.', 403)
  }

  const now = Math.floor(Date.now() / 1000)
  const maxAge = expiresAt ? expiresAt - now : 60 * 60
  if (maxAge <= 0) {
    return sessionError('Admin-Sitzung konnte nicht erstellt werden: Zugriffstoken ist abgelaufen.', 401)
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_AUTH_COOKIE, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge,
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_AUTH_COOKIE, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  })

  return response
}
