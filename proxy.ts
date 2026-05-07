import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const TRAINER_ROOT = '/admin'
const CLIENT_ROOT = '/client'

const PUBLIC_AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/auth']

function isUnder(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

function isPublicAuthPath(pathname: string) {
  return PUBLIC_AUTH_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass-through response we can attach refreshed Supabase cookies to.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const wantsTrainer = isUnder(pathname, TRAINER_ROOT)
  const wantsClient = isUnder(pathname, CLIENT_ROOT)

  // 1. Not logged in → push to /login if a protected area was requested
  if (!user) {
    if (wantsTrainer || wantsClient) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
    return response
  }

  // 2. Logged in → resolve role from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role as 'trainer' | 'client' | undefined
  const home = role === 'trainer' ? TRAINER_ROOT : CLIENT_ROOT

  // 3. Logged in and on a public auth page → bounce to the right dashboard
  if (isPublicAuthPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = home
    url.search = ''
    return NextResponse.redirect(url)
  }

  // 4. Wrong role for the requested area → redirect to their own dashboard
  if (role === 'trainer' && wantsClient) {
    const url = request.nextUrl.clone()
    url.pathname = TRAINER_ROOT
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (role === 'client' && wantsTrainer) {
    const url = request.nextUrl.clone()
    url.pathname = CLIENT_ROOT
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api|favicon.ico|logo|icons|manifest|sw|workbox|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|js|css|map|webmanifest|woff|woff2|ttf)$).*)',
  ],
}
