'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAdminEmail, normalizeEmail } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register'

type AdminSessionResult =
  | { ok: true }
  | { ok: false; message: string }

const createAdminSession = async (accessToken: string, expiresAt?: number) => {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, expiresAt }),
    })
    const payload = await response.json().catch(() => null) as { message?: unknown } | null

    if (response.ok) return { ok: true } as const

    return {
      ok: false,
      message: typeof payload?.message === 'string'
        ? payload.message
        : `Admin-Sitzung konnte nicht erstellt werden. Status: ${response.status}`,
    } as const
  } catch {
    return {
      ok: false,
      message: 'Admin-Sitzung konnte nicht erstellt werden: Netzwerkfehler beim Speichern der Sitzung.',
    } as const
  }
}

const clearAdminSession = async () => {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' })
  } catch {
    // Login routing should not be blocked by stale cookie cleanup.
  }
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const normalizedEmail = normalizeEmail(email)

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error) { setError(error.message); setLoading(false); return }

      if (isAdminEmail(data.user.email)) {
        if (!data.session?.access_token) {
          setError('Admin-Sitzung konnte nicht erstellt werden.')
          setLoading(false)
          return
        }

        const sessionResult: AdminSessionResult = await createAdminSession(data.session.access_token, data.session.expires_at)
        if (!sessionResult.ok) {
          setError(sessionResult.message)
          setLoading(false)
          return
        }

        router.push('/admin')
        return
      }

      // Link clients.user_id falls Trainer den Client per E-Mail vorangelegt hat
      await supabase
        .from('clients')
        .update({ user_id: data.user.id })
        .eq('email', normalizedEmail)
        .is('user_id', null)

      await clearAdminSession()
      router.push('/client')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name: fullName, role: 'client' } },
    })
    if (error) { setError(error.message); setLoading(false); return }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: normalizedEmail,
        full_name: fullName,
        role: 'client',
      })
      // Link clients.user_id (Trainer hat ggf. per E-Mail vorangelegt)
      const linkRes = await supabase
        .from('clients')
        .update({ user_id: data.user.id })
        .eq('email', normalizedEmail)
        .is('user_id', null)
        .select('id')
      console.log('[auth] linked clients rows on signup:', linkRes.data?.length ?? 0)

      await clearAdminSession()
      router.push('/client')
    } else {
      setError('Bitte bestätige deine E-Mail-Adresse.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white text-3xl mb-4 shadow-lg">
            💪
          </div>
          <h1 className="text-3xl font-bold text-gray-900">FitCoach</h1>
          <p className="text-gray-500 mt-1 text-sm">Dein persönlicher Fitness-Begleiter</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Anmelden
            </button>
            <button
              onClick={() => { setMode('register'); setError('') }}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${
                mode === 'register'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/40'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Registrieren
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  placeholder="Max Mustermann"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
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
              {loading ? 'Bitte warten…' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
