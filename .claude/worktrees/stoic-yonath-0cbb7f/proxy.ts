import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, isAdminEmail, getEmailFromJwt } from '@/lib/admin'

const redirectToLogin = (request: NextRequest) => {
  const response = NextResponse.redirect(new URL('/login', request.url))
  response.cookies.set(ADMIN_AUTH_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}

export function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ADMIN_AUTH_COOKIE)?.value
  if (!accessToken) return redirectToLogin(request)

  const email = getEmailFromJwt(accessToken)
  if (!isAdminEmail(email)) return redirectToLogin(request)

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
