import { NextResponse, type NextRequest } from 'next/server'
import jwt, { type JwtPayload } from 'jsonwebtoken'

const TRAINER_ROOT = '/admin'
const CLIENT_ROOT = '/client'
const BACKEND_TOKEN_COOKIE = 'backend_token'

function isUnder(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

interface BackendTokenPayload extends JwtPayload {
  sub?: string
  role?: string
}

function loginRedirect(request: NextRequest, clearToken = false) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('redirect', request.nextUrl.pathname)
  const response = NextResponse.redirect(url)
  if (clearToken) response.cookies.delete(BACKEND_TOKEN_COOKIE)
  return response
}

function readVerifiedRole(token: string): string | null {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  try {
    const payload = jwt.verify(token, secret) as BackendTokenPayload
    return typeof payload.sub === 'string' && typeof payload.role === 'string'
      ? payload.role.toLowerCase()
      : null
  } catch {
    return null
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const wantsTrainer = isUnder(pathname, TRAINER_ROOT)
  const wantsClient = isUnder(pathname, CLIENT_ROOT)
  const token = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value

  if ((wantsTrainer || wantsClient) && !token) {
    return loginRedirect(request)
  }

  if (token && (wantsTrainer || wantsClient)) {
    const role = readVerifiedRole(token)
    if (!role) return loginRedirect(request, true)

    if (wantsTrainer && role === 'client') {
      return NextResponse.redirect(new URL(CLIENT_ROOT, request.url))
    }
    if (wantsClient && (role === 'trainer' || role === 'admin')) {
      return NextResponse.redirect(new URL(TRAINER_ROOT, request.url))
    }
    if (
      (wantsTrainer && role !== 'trainer' && role !== 'admin')
      || (wantsClient && role !== 'client')
    ) {
      return loginRedirect(request, true)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api|favicon.ico|logo|icons|manifest|sw|workbox|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|js|css|map|webmanifest|woff|woff2|ttf)$).*)',
  ],
}
