'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Profile } from '@/lib/types'
import ActiveWorkoutBanner from './ActiveWorkoutBanner'
import NotificationBell from '@/components/NotificationBell'
import { PageFade, ToastProvider } from '@/components/Motion'

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const NavIcon = {
  home: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 12L12 3l9 9" /><path d="M9 21V12h6v9" /><path d="M3 12v9h18v-9" /></svg>,
  training: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" /></svg>,
  nutrition: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 21c-4 0-7-3.5-7-8 0-3 2-5 4-5 1.2 0 1.8.5 3 .5s1.8-.5 3-.5c2 0 4 2 4 5 0 4.5-3 8-7 8z" /><path d="M12 8c0-2.5 1.5-4 4-4" /></svg>,
  progress: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
  messages: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 3.5V17H6a2 2 0 01-2-2V6z" /></svg>,
}

const navItems = [
  { href: '/client', label: 'Home', icon: NavIcon.home },
  { href: '/client/plan', label: 'Training', icon: NavIcon.training },
  { href: '/client/nutrition', label: 'Ernährung', icon: NavIcon.nutrition },
  { href: '/client/progress', label: 'Fortschritt', icon: NavIcon.progress },
  { href: '/client/messages', label: 'Nachrichten', icon: NavIcon.messages },
]

interface AuthMePayload {
  ok?: boolean
  user?: { userId?: string; role?: string } | null
}

interface ClientProfilePayload {
  client?: { id: string; fullName: string; email: string } | null
}

interface RestoreResponse {
  ok?: boolean
}

interface BackendNotification {
  id: string
  type: string
  is_read: boolean
}

const getStoredAuthToken = () =>
  typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null

const getCachedUser = (): Profile | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem('cached_user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as Profile
  } catch {
    return null
  }
}

const setCachedUser = (user: Profile) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('cached_user', JSON.stringify(user))
}

const clearStoredSession = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('auth_token')
  window.localStorage.removeItem('cached_user')
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [loading, setLoading] = useState(true)
  // SSR-safe: navigator only exists in the browser.
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const loadAuth = async () => {
          const response = await fetch('/api/backend/auth/me', { method: 'GET', cache: 'no-store' })
          const payload = await response.json().catch(() => null) as AuthMePayload | null
          return { response, payload }
        }

        let { response: authResponse, payload: authPayload } = await loadAuth()

        if (authResponse.status === 401) {
          const token = getStoredAuthToken()
          if (!token) {
            router.replace('/login')
            return
          }

          const restoreResponse = await fetch('/api/backend/auth/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          })
          const restorePayload = await restoreResponse.json().catch(() => null) as RestoreResponse | null

          if (!restoreResponse.ok || !restorePayload?.ok) {
            clearStoredSession()
            router.replace('/login')
            return
          }

          const retried = await loadAuth()
          authResponse = retried.response
          authPayload = retried.payload
        }

        if (!authResponse.ok || !authPayload?.ok || !authPayload.user?.role) {
          if (authResponse.status === 401) clearStoredSession()
          router.replace('/login')
          return
        }

        const role = authPayload.user.role.toLowerCase()
        if (role === 'trainer' || role === 'admin') { router.replace('/admin'); return }
        if (role !== 'client') { router.replace('/login'); return }

        const clientProfileResponse = await fetch('/api/backend/me/client-profile', { method: 'GET', cache: 'no-store' })
        const clientPayload = await clientProfileResponse.json().catch(() => null) as ClientProfilePayload | null
        if (!clientProfileResponse.ok || !clientPayload?.client?.id) {
          router.replace('/login')
          return
        }

        const nextProfile: Profile = {
          id: clientPayload.client.id,
          email: clientPayload.client.email,
          full_name: clientPayload.client.fullName,
          role: 'client',
          created_at: '',
        }

        setCachedUser(nextProfile)
        setProfile(nextProfile)
      } catch {
        const token = getStoredAuthToken()
        if (!token) {
          router.replace('/login')
          return
        }

        const cachedUser = getCachedUser()
        if (cachedUser) {
          setProfile(cachedUser)
        }
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [router])

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/backend/me/notifications?limit=100', { method: 'GET', cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json().catch(() => null) as { notifications?: BackendNotification[] } | null
      const count = (payload?.notifications ?? []).filter(n => n.type === 'message' && !n.is_read).length
      setUnreadMessageCount(count)
    } catch {
      setUnreadMessageCount(0)
    }
  }, [])

  useEffect(() => {
    if (!profile?.id) return
    void loadUnreadCount()
    const refresh = () => { void loadUnreadCount() }
    const intervalId = setInterval(refresh, 8000)
    window.addEventListener('focus', refresh)
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [profile?.id, loadUnreadCount])

  useEffect(() => {
    if (pathname.startsWith('/client/messages')) setUnreadMessageCount(0)
  }, [pathname])

  // Catch the connection dropping while the app is in use.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const handleLogout = async () => {
    try {
      clearStoredSession()
      await fetch('/api/backend/auth/logout', { method: 'POST' })
    } finally {
      router.replace('/login')
    }
  }

  const offlineOverlay = offline ? (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#A78BFA]/40 bg-[#1a1a2e] px-4 py-3 text-[#EDECEA] shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.8)]"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3 text-sm">
        <p className="truncate font-medium">Du bist offline</p>
        <button
          onClick={() => window.location.reload()}
          className="press shrink-0 text-xs font-semibold text-[#C4B5FD] underline underline-offset-4 hover:text-[#DDD6FE]"
        >
          Neu laden
        </button>
      </div>
    </div>
  ) : null

  if (loading) {
    return (
      <>
        {offlineOverlay}
        <div className="min-h-screen flex items-center justify-center bg-[#050504]">
          <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    )
  }

  // Training is active on /client/plan/* AND /client/workout/* (active workout play)
  const getIsActive = (itemHref: string): boolean => {
    if (itemHref === '/client') return pathname === '/client'
    if (itemHref === '/client/plan') return pathname.startsWith('/client/plan') || pathname.startsWith('/client/workout')
    return pathname.startsWith(itemHref)
  }

  // Messages uses a full-height chat layout (chat fills viewport, input docked
  // above the nav, list scrolls internally) instead of the normal scrolling page.
  const isMessages = pathname.startsWith('/client/messages')

  return (
    <ToastProvider>
      {offlineOverlay}
      <div
        className={`bg-[#050504] ${isMessages ? 'h-[100dvh] overflow-hidden flex flex-col' : 'min-h-screen'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >

        {/* Top header */}
        <div className="sticky top-0 z-20">
          <header className="bg-[#0b0c0f]/95 backdrop-blur-md border-b border-white/[0.06]">
            <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="MilaCoach" className="w-7 h-7 object-contain rounded-lg" />
                <span className="font-bold text-[#EDECEA] tracking-tight">MilaCoach</span>
              </div>
              <div className="flex items-center gap-2.5">
                {profile && <NotificationBell clientUserId={profile.id} />}
                <div className="w-8 h-8 rounded-full bg-[#A78BFA]/15 border border-[#A78BFA]/25 flex items-center justify-center text-[#A78BFA] text-sm font-bold">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'K'}
                </div>
                <button
                  onClick={handleLogout}
                  className="press text-xs text-[#797D83] hover:text-[#EDECEA] transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.05]"
                >
                  Abmelden
                </button>
              </div>
            </div>
          </header>
          <div className="max-w-[480px] mx-auto">
            <ActiveWorkoutBanner />
          </div>
        </div>

        {/* Page content — pb-28 reserves space above the fixed nav.
            Messages instead fills the remaining height (flex-1) so the chat can
            dock its input above the nav; the chat handles its own bottom spacing. */}
        <main className={isMessages ? 'flex-1 min-h-0' : 'pb-28'}>
          <PageFade key={pathname} className={isMessages ? 'h-full' : ''}>
            {children}
          </PageFade>
        </main>

        {/* Floating pill bottom nav — always visible, all routes */}
        <div
          className="fixed bottom-0 inset-x-0 z-30 px-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-[480px] mx-auto">
            {/* pt-6: headroom so the raised active circle isn't clipped */}
            <div className="pt-6">
              <nav className="bg-[#0f0f12]/[0.97] backdrop-blur-2xl border border-white/[0.07] rounded-[28px] shadow-[0_-1px_0_0_rgba(255,255,255,0.04)_inset,0_12px_48px_-8px_rgba(0,0,0,0.72)]">
                <div className="flex">
                  {navItems.map(item => {
                    const active = getIsActive(item.href)
                    const isCenter = item.href === '/client/nutrition'
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="relative flex-1 flex flex-col items-center pt-3 pb-2.5 transition-colors"
                      >
                        {/* Center tab (Ernährung) only — floating circle, unchanged */}
                        {isCenter && (
                          <>
                            <span className="absolute -top-[20px] left-1/2 -translate-x-1/2 w-[52px] h-[52px] rounded-full bg-[#0f0f12] ring-1 ring-white/[0.07] z-[9]" />
                            <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-br from-[#A78BFA] to-[#7C3AED] flex items-center justify-center text-white z-10 shadow-[0_0_0_1px_rgba(255,255,255,0.16)_inset,0_4px_24px_-2px_rgba(124,58,237,0.65),0_2px_8px_rgba(0,0,0,0.35)]">
                              <span className="w-[18px] h-[18px] block">{item.icon}</span>
                            </span>
                          </>
                        )}
                        {/* Icon — invisible for center (inside circle), colored for the other 4 tabs */}
                        <span className={`w-[18px] h-[18px] block ${
                          isCenter ? 'invisible' : active ? 'text-[#A78BFA]' : 'text-[#52565e]'
                        }`}>
                          {item.icon}
                        </span>
                        {/* Pill indicator — non-center active tabs only, absolute so it doesn't shift layout */}
                        {!isCenter && active && (
                          <span className="absolute top-[30px] left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full bg-[#8b5cf6]" />
                        )}
                        {/* Label */}
                        <span className={`text-[9.5px] font-semibold tracking-wide mt-[5px] ${active ? 'text-[#A78BFA]' : 'text-[#52565e]'}`}>
                          {item.label}
                        </span>
                        {/* Unread badge — fixed position regardless of active state */}
                        {item.href === '/client/messages' && unreadMessageCount > 0 && (
                          <span className="absolute right-[15%] top-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[#0f0f12]">
                            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  )
}
