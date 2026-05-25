import { NextResponse } from 'next/server'

const BACKEND_TOKEN_COOKIE = 'backend_token'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(BACKEND_TOKEN_COOKIE, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  })
  return response
}

