'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import ActiveWorkoutBanner from './ActiveWorkoutBanner'
import NotificationBell from '@/components/NotificationBell'
import { PageFade, ToastProvider } from '@/components/Motion'

const navItems = [
  { href: '/client', label: 'Home', icon: '🏠' },
  { href: '/client/plan', label: 'Training', icon: '💪' },
  { href: '/client/nutrition', label: 'Ernährung', icon: '🥗' },
  { href: '/client/progress', label: 'Fortschritt', icon: '📈' },
  { href: '/client/messages', label: 'Nachrichten', icon: '💬' },
]

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof || prof.role !== 'client') {
        router.replace(prof?.role === 'trainer' ? '/admin' : '/login')
        return
      }

      setProfile(prof)

      // Link this user to their client record if not linked yet
      const { data: client } = await supabase
        .from('clients')
        .select('id, user_id')
        .eq('email', user.email)
        .is('user_id', null)
        .maybeSingle()

      if (client) {
        await supabase.from('clients').update({ user_id: user.id }).eq('id', client.id)
      }

      setLoading(false)
    }
    checkAuth()
  }, [router])

  const loadUnreadCount = useCallback(async (userId: string) => {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', userId)
      .eq('type', 'message')
      .eq('is_read', false)
    setUnreadMessageCount(count ?? 0)
  }, [])

  useEffect(() => {
    if (!profile?.id) return
    void loadUnreadCount(profile.id)
    const refresh = () => { void loadUnreadCount(profile.id) }
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
    if (!profile?.id) return
    const channel = supabase
      .channel(`client-msg-badge-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `client_id=eq.${profile.id}` },
        () => { void loadUnreadCount(profile.id) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, loadUnreadCount])

  useEffect(() => {
    if (pathname.startsWith('/client/messages')) setUnreadMessageCount(0)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <ToastProvider>
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky top block: header + active workout banner */}
      <div className="sticky top-0 z-10">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="MilaCoach" className="w-7 h-7 object-contain" />
            <span className="font-bold text-gray-900">MilaCoach</span>
          </div>
          <div className="flex items-center gap-3">
            {profile && <NotificationBell clientUserId={profile.id} />}
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold">
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'K'}
            </div>
            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Abmelden
            </button>
          </div>
        </header>
        <ActiveWorkoutBanner />
      </div>

      {/* Content */}
      <main className="flex-1 pb-20">
        <PageFade key={pathname}>
          {children}
        </PageFade>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="flex">
          {navItems.map(item => {
            const active = item.href === '/client'
              ? pathname === '/client'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                  active ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
                {item.href === '/client/messages' && unreadMessageCount > 0 && (
                  <span className="absolute right-[25%] top-0.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
    </ToastProvider>
  )
}
