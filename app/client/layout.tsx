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

interface BackendNotification {
  id: string
  type: string
  is_read: boolean
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authResponse = await fetch('/api/backend/auth/me', { method: 'GET', cache: 'no-store' })
        const authPayload = await authResponse.json().catch(() => null) as AuthMePayload | null

        if (!authResponse.ok || !authPayload?.ok || !authPayload.user?.role) {
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

        setProfile({
          id: clientPayload.client.id,
          email: clientPayload.client.email,
          full_name: clientPayload.client.fullName,
          role: 'client',
          created_at: '',
        })
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

  const handleLogout = async () => {
    try {
      await fetch('/api/backend/auth/logout', { method: 'POST' })
    } finally {
      router.replace('/login')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050504]">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isMessages = pathname.startsWith('/client/messages')

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#050504]">

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

        {/* Page content */}
        <main className={isMessages ? 'pb-0' : 'pb-28'}>
          <PageFade key={pathname}>
            {children}
          </PageFade>
        </main>

        {/* Floating pill bottom nav */}
        {!isMessages && (
          <div className="fixed bottom-4 inset-x-0 z-30 px-4">
            <div className="max-w-[480px] mx-auto">
              <nav className="bg-[#111111]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)] overflow-hidden">
                <div className="flex items-stretch">
                  {navItems.map(item => {
                    const active = item.href === '/client'
                      ? pathname === '/client'
                      : pathname.startsWith(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`relative flex-1 flex flex-col items-center gap-1 pt-3 pb-2.5 transition-colors ${
                          active ? 'text-[#A78BFA]' : 'text-[#797D83] hover:text-[#EDECEA]'
                        }`}
                      >
                        {active && (
                          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-b-full bg-[#A78BFA] shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                        )}
                        <span className={`w-5 h-5 block transition-transform ${active ? 'scale-110' : ''}`}>
                          {item.icon}
                        </span>
                        <span className={`text-[9.5px] font-semibold tracking-wide ${active ? 'text-[#A78BFA]' : 'text-[#797D83]'}`}>
                          {item.label}
                        </span>
                        {item.href === '/client/messages' && unreadMessageCount > 0 && (
                          <span className="absolute right-[18%] top-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-[#111111]">
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
        )}
      </div>
    </ToastProvider>
  )
}
