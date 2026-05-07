'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const createAdminSession = async (accessToken: string, expiresAt?: number) => {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, expiresAt }),
    })
    const payload = await response.json().catch(() => null) as { message?: unknown } | null
    if (response.ok) return { ok: true, isAdmin: true } as const
    if (response.status === 403) return { ok: true, isAdmin: false } as const
    return {
      ok: false,
      isAdmin: false,
      message: typeof payload?.message === 'string'
        ? payload.message
        : `Admin-Sitzung konnte nicht erstellt werden (Status ${response.status}).`,
    } as const
  } catch {
    return { ok: false, message: 'Netzwerkfehler beim Erstellen der Admin-Sitzung.' } as const
  }
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const clearAdminSession = async () => {
  try { await fetch('/api/auth/session', { method: 'DELETE' }) } catch { /* ignore */ }
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const normalizedEmail = normalizeEmail(email)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInError) { setError(signInError.message); setLoading(false); return }

    if (!data.session?.access_token) {
      setError('Sitzung konnte nicht erstellt werden.')
      setLoading(false)
      return
    }

    const result = await createAdminSession(data.session.access_token, data.session.expires_at)
    if (!result.ok) { setError(result.message); setLoading(false); return }

    if (result.isAdmin) {
      router.push('/admin')
      return
    }

    // Client login — link user_id if not yet linked
    await supabase
      .from('clients')
      .update({ user_id: data.user.id })
      .eq('email', normalizedEmail)
      .is('user_id', null)

    await clearAdminSession()
    router.push('/client')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MilaCoach" className="w-24 h-24 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">MilaCoach</h1>
          <p className="text-gray-500 mt-1 text-sm">Dein persönlicher Fitness-Begleiter</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-6 pb-2">
            <h2 className="text-lg font-semibold text-gray-900">Anmelden</h2>
            <p className="text-gray-500 text-sm mt-0.5">Melde dich mit deinen Zugangsdaten an.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm mt-2"
            >
              {loading ? 'Bitte warten…' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
