'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const normalizeEmail = (v: string) => v.trim().toLowerCase()

interface LoginResponse { ok?: boolean; message?: string; errorId?: string }
interface MeResponse { ok?: boolean; user?: { role?: string } | null; message?: string; errorId?: string }
const withErrorId = (m: string, id?: string) => id ? `${m} (Fehler-ID: ${id})` : m

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showForm, setShowForm] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const loginRes = await fetch('/api/backend/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(email), password }),
      })
      const loginPayload = await loginRes.json().catch(() => null) as LoginResponse | null
      if (!loginRes.ok) { setError(withErrorId(loginPayload?.message ?? 'Anmeldung fehlgeschlagen.', loginPayload?.errorId)); setLoading(false); return }

      const meRes = await fetch('/api/backend/auth/me', { method: 'GET', cache: 'no-store' })
      const mePayload = await meRes.json().catch(() => null) as MeResponse | null
      if (!meRes.ok || !mePayload?.ok || !mePayload.user?.role) { setError(withErrorId(mePayload?.message ?? 'Sitzung konnte nicht validiert werden.', mePayload?.errorId)); setLoading(false); return }

      const role = mePayload.user.role.toLowerCase()
      if (role === 'trainer' || role === 'admin') { router.push('/admin'); return }
      if (role === 'client') { router.push('/client'); return }
      setError('Unbekannte Benutzerrolle.')
      setLoading(false)
    } catch {
      setError('Netzwerkfehler bei der Anmeldung.')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-[#050504]">
      {/* Hero image — trainer 1 */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/app-style/1.jpeg"
          alt="Trainer"
          fill
          priority
          className="object-cover object-center"
          style={{ filter: 'brightness(0.45) contrast(1.15) saturate(0.9)' }}
        />
        {/* multi-stop gradient overlay matching reference style */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050504] via-[#050504]/70 to-[#050504]/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050504]/60 via-transparent to-transparent" />
      </div>

      {/* Logo top-left */}
      <div className="relative z-10 flex items-center gap-3 px-6 pt-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="MilaCoach" className="w-8 h-8 rounded-xl object-contain" />
        <span className="text-white font-bold text-[16px] tracking-tight">MilaCoach</span>
      </div>

      {/* Bottom panel */}
      <div className="relative z-10 mt-auto px-6 pb-12 pt-6">
        {!showForm ? (
          <div className="motion-page-fade">
            {/* headline matching reference style */}
            <h1 className="text-white text-[42px] font-extrabold leading-[1.0] tracking-tight mb-4">
              Train Smart<br />
              Stay{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-white">Strong</span>
                <span className="absolute inset-0 -mx-2 -my-0.5 bg-[#A78BFA] rounded-lg z-0" />
              </span>
            </h1>
            <p className="text-white/60 text-[14px] leading-relaxed mb-8 max-w-xs">
              Personalisiertes Coaching, Trainingspläne und Ernährungsberatung – alles an einem Ort.
            </p>

            {/* Category pills matching reference */}
            <div className="flex gap-2 mb-8">
              {['Power', 'Mindset', 'Balance'].map(tag => (
                <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.1] border border-white/[0.12] text-white/80 text-[12px] font-medium backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="press w-full bg-[#A78BFA] hover:bg-[#B79FFB] text-white font-bold py-4 rounded-2xl text-[15px] tracking-wide transition-colors shadow-[0_8px_32px_-8px_rgba(255,99,36,0.6)]"
              >
                Anmelden
              </button>
              <button
                disabled
                className="w-full border border-white/[0.15] text-white/50 font-semibold py-4 rounded-2xl text-[15px] tracking-wide cursor-not-allowed backdrop-blur-sm bg-white/[0.04]"
              >
                Konto erstellen
              </button>
            </div>
          </div>
        ) : (
          <div className="motion-page-fade">
            <button
              onClick={() => { setShowForm(false); setError('') }}
              className="press flex items-center gap-1.5 text-white/60 text-[13px] mb-6 -ml-1 px-1 py-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Zurück
            </button>

            <h2 className="text-white text-[28px] font-bold tracking-tight mb-1">Willkommen zurück</h2>
            <p className="text-white/50 text-[13px] mb-6">Melde dich mit deinen Zugangsdaten an.</p>

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-[0.12em]">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="name@example.com"
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.07] border border-white/[0.1] text-white placeholder-white/30 focus:border-[#A78BFA]/60 focus:bg-white/[0.09] transition text-[14px] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-[0.12em]">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.07] border border-white/[0.1] text-white placeholder-white/30 focus:border-[#A78BFA]/60 focus:bg-white/[0.09] transition text-[14px] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="press w-full bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-[15px] tracking-wide transition-colors mt-2 shadow-[0_8px_32px_-8px_rgba(255,99,36,0.5)]"
              >
                {loading ? 'Bitte warten…' : 'Anmelden'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
