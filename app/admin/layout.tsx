'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ADMIN_EMAIL, isAdminEmail } from '@/lib/admin'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'
import { PageFade, ToastProvider } from '@/components/Motion'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/clients', label: 'Kunden', icon: '👥' },
  { href: '/admin/plans', label: 'Trainingspläne', icon: '📋' },
  { href: '/admin/nutrition', label: 'Ernährung', icon: '🥗' },
  { href: '/admin/recipes', label: 'Rezepte', icon: '📖' },
  { href: '/admin/requests', label: 'Anfragen', icon: '🔄' },
  { href: '/admin/messages', label: 'Nachrichten', icon: '💬' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthError(null)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        if (!isAdminEmail(user.email)) { router.replace('/login'); return }

        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        setProfile(data ?? {
          id: user.id,
          email: user.email ?? ADMIN_EMAIL,
          full_name: user.user_metadata?.full_name ?? 'Admin',
          role: 'trainer',
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        try {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: session.access_token,
              expiresAt: session.expires_at,
            }),
          })
        } catch {
          return
        }
      }
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' })
      await supabase.auth.signOut()
    } catch {
      return
    } finally {
      router.replace('/login')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 max-w-sm text-center">
          <h1 className="text-lg font-semibold text-gray-900">Admin nicht erreichbar</h1>
          <p className="text-sm text-gray-500 mt-2">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
    <div className="min-h-screen flex bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 flex flex-col transform transition-transform duration-200
        lg:translate-x-0 lg:static lg:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="px-6 py-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="MilaCoach" className="w-9 h-9 object-contain" />
            <div>
              <div className="text-white font-bold text-lg leading-none">MilaCoach</div>
              <div className="text-gray-400 text-xs mt-0.5">Admin</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const active = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Profile + Logout */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{profile?.full_name}</div>
              <div className="text-gray-500 text-xs truncate">{profile?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <span>🚪</span> Abmelden
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-gray-900">MilaCoach</span>
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
