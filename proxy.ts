import { NextResponse, type NextRequest } from 'next/server'

const TRAINER_ROOT = '/admin'
const CLIENT_ROOT = '/client'
const BACKEND_TOKEN_COOKIE = 'backend_token'

function isUnder(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const wantsTrainer = isUnder(pathname, TRAINER_ROOT)
  const wantsClient = isUnder(pathname, CLIENT_ROOT)
  const token = request.cookies.get(BACKEND_TOKEN_COOKIE)?.value

  if ((wantsTrainer || wantsClient) && !token) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api|favicon.ico|logo|icons|manifest|sw|workbox|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|js|css|map|webmanifest|woff|woff2|ttf)$).*)',
  ],
}
