'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Profile } from '@/lib/types'
import { PageFade, ToastProvider } from '@/components/Motion'
import TrainerNotificationBell from '@/components/TrainerNotificationBell'

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3.25" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3 3 0 010 6" /><path d="M21 20c0-2.5-1.7-4.7-4-5.6" /></svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" {...stroke}><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /><path d="M8 3v3M16 3v3" /></svg>
  ),
  nutrition: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M12 21c-4 0-7-3.5-7-8 0-3 2-5 4-5 1.2 0 1.8.5 3 .5s1.8-.5 3-.5c2 0 4 2 4 5 0 4.5-3 8-7 8z" /><path d="M12 8c0-2.5 1.5-4 4-4" /></svg>
  ),
  recipes: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" /><path d="M5 17a3 3 0 003 3" /><path d="M9 8h6M9 12h6" /></svg>
  ),
  requests: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M4 12a8 8 0 0114-5.3L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 01-14 5.3L4 16" /><path d="M4 20v-4h4" /></svg>
  ),
  messages: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 3.5V17H6a2 2 0 01-2-2V6z" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" {...stroke}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  ),
}

type NavBadgeKey = 'messages' | 'requests'

const navItems: { href: string; label: string; icon: ReactNode; badgeKey?: NavBadgeKey }[] = [
  { href: '/admin', label: 'Dashboard', icon: Icon.dashboard },
  { href: '/admin/clients', label: 'Kunden', icon: Icon.users },
  { href: '/admin/plans', label: 'Trainingspläne', icon: Icon.plans },
  { href: '/admin/nutrition', label: 'Ernährung', icon: Icon.nutrition },
  { href: '/admin/recipes', label: 'Rezepte', icon: Icon.recipes },
  { href: '/admin/requests', label: 'Anfragen', icon: Icon.requests, badgeKey: 'requests' },
  { href: '/admin/messages', label: 'Nachrichten', icon: Icon.messages, badgeKey: 'messages' },
]

interface AuthMeResponse {
  ok?: boolean
  user?: {
    userId?: string
    role?: string
    email?: string
    fullName?: string
  } | null
  message?: string
}

type MessageClientUnreadItem = {
  unreadCount?: number | null
}

type MessagesClientsResponse = {
  clients?: MessageClientUnreadItem[]
}

type ExerciseChangeRequestsResponse = {
  requests?: Array<{ id?: string }>
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navBadgeCounts, setNavBadgeCounts] = useState<Record<NavBadgeKey, number>>({
    messages: 0,
    requests: 0,
  })

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthError(null)
        const response = await fetch('/api/backend/auth/me', {
          method: 'GET',
          cache: 'no-store',
        })

        const payload = await response.json().catch(() => null) as AuthMeResponse | null
        if (!response.ok || !payload?.ok || !payload.user?.userId) {
          router.replace('/login')
          return
        }

        const role = typeof payload.user.role === 'string' ? payload.user.role.toLowerCase() : ''
        if (role === 'client') {
          router.replace('/client')
          return
        }
        if (role !== 'trainer' && role !== 'admin') {
          router.replace('/login')
          return
        }

        const fullName = typeof payload.user.fullName === 'string' && payload.user.fullName.trim()
          ? payload.user.fullName.trim()
          : 'Trainer'
        const email = typeof payload.user.email === 'string' ? payload.user.email : ''

        setProfile({
          id: payload.user.userId,
          email,
          full_name: fullName,
          role: role === 'admin' ? 'trainer' : role,
          created_at: '',
        })
      } catch {
        setAuthError('Admin-Bereich konnte gerade nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const loadSidebarBadgeCounts = useCallback(async () => {
    let unreadMessages: number | null = null
    let openRequests: number | null = null

    const [messagesResult, requestsResult] = await Promise.allSettled([
      fetch('/api/backend/messages/clients', {
        method: 'GET',
        cache: 'no-store',
      }),
      fetch('/api/backend/clients/exercise-change-requests?status=pending', {
        method: 'GET',
        cache: 'no-store',
      }),
    ])

    if (messagesResult.status === 'fulfilled' && messagesResult.value.ok) {
      const payload = await messagesResult.value.json().catch(() => null) as MessagesClientsResponse | null
      unreadMessages = (payload?.clients ?? []).reduce((sum, item) => {
        const value = typeof item.unreadCount === 'number' ? item.unreadCount : 0
        return sum + Math.max(0, value)
      }, 0)
    }

    if (requestsResult.status === 'fulfilled' && requestsResult.value.ok) {
      const payload = await requestsResult.value.json().catch(() => null) as ExerciseChangeRequestsResponse | null
      openRequests = Array.isArray(payload?.requests) ? payload.requests.length : 0
    }

    if (unreadMessages === null && openRequests === null) {
      return
    }

    setNavBadgeCounts(prev => ({
      ...prev,
      ...(unreadMessages !== null ? { messages: unreadMessages } : {}),
      ...(openRequests !== null ? { requests: openRequests } : {}),
    }))
  }, [])

  useEffect(() => {
    if (!profile) return

    void loadSidebarBadgeCounts()

    const interval = setInterval(() => void loadSidebarBadgeCounts(), 30_000)
    const onFocus = () => { void loadSidebarBadgeCounts() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadSidebarBadgeCounts()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadSidebarBadgeCounts, profile, pathname])

  const handleLogout = async () => {
    try {
      await fetch('/api/backend/auth/logout', { method: 'POST' })
    } catch {
      // Ignore and redirect anyway.
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

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050504] px-4">
        <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-6 max-w-sm text-center">
          <h1 className="text-lg font-semibold text-[#EDECEA]">Admin nicht erreichbar</h1>
          <p className="text-sm text-[#797D83] mt-2">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="press mt-5 px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-bold rounded-xl"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-[#050504]">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`
          fixed inset-y-0 left-0 z-30 w-[260px] flex flex-col overflow-visible
          bg-[#0b0c0f] text-white/50
          border-r border-white/[0.06]
          transition-transform duration-300
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
          style={{ transitionTimingFunction: 'var(--ease-out)' }}
        >
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="MilaCoach" className="w-9 h-9 rounded-lg object-contain ring-1 ring-white/10" />
              <div className="leading-tight">
                <div className="text-white font-semibold text-[15px] tracking-tight">MilaCoach</div>
                <div className="text-[#797D83] text-[11px] uppercase tracking-[0.12em] mt-0.5">Trainer</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 pt-2 space-y-0.5 overflow-y-auto">
            {navItems.map(item => {
              const active = item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href)
              const badgeCount = item.badgeKey ? navBadgeCounts[item.badgeKey] : 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`press group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium ${
                    active
                      ? 'text-white bg-white/[0.06]'
                      : 'text-[#797D83] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#A78BFA]" />
                  )}
                  <span className={`w-[18px] h-[18px] flex items-center justify-center ${active ? 'text-[#A78BFA]' : 'text-[#797D83] group-hover:text-white/50'}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-[#A78BFA] text-[#050504] text-[11px] font-bold leading-none flex items-center justify-center tabular-nums ring-1 ring-white/20">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="px-3 py-3 border-t border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] pr-2">
              <div className="w-8 h-8 rounded-full bg-[#A78BFA] flex items-center justify-center text-[#050504] text-[13px] font-semibold">
                {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'T'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-[13px] font-medium truncate">{profile?.full_name}</div>
                <div className="text-[#797D83] text-[11px] truncate">{profile?.email}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="press mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-[#797D83] hover:text-white hover:bg-white/[0.04]"
            >
              <span className="w-[18px] h-[18px] flex items-center justify-center text-[#797D83]">{Icon.logout}</span>
              Abmelden
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 bg-[#0b0c0f]/95 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center gap-3 h-[56px]">
            <button
              onClick={() => setSidebarOpen(true)}
              className="press lg:hidden p-1.5 rounded-lg text-white/50 hover:bg-white/[0.06]"
            >
              <span className="w-5 h-5 block">{Icon.menu}</span>
            </button>
            <span className="font-semibold text-[#EDECEA] tracking-tight flex-1 lg:hidden">MilaCoach</span>
            <div className="ml-auto">
              {profile && <TrainerNotificationBell trainerId={profile.id} />}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <PageFade key={pathname}>
              {children}
            </PageFade>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
