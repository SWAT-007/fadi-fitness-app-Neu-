'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export default function NewTrainerPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) {
      setError('Name ist erforderlich.')
      return
    }
    if (!isValidEmail(email.trim())) {
      setError('Gültige E-Mail erforderlich.')
      return
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen haben.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/backend/trainers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        }),
      })

      const payload = await response.json().catch(() => null) as {
        message?: string
        error?: string
      } | null

      if (!response.ok) {
        if (response.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError(payload?.message ?? payload?.error ?? 'Unbekannter Fehler.')
        }
        setSaving(false)
        return
      }

      router.push('/admin/trainers')
    } catch {
      setError('Netzwerkfehler beim Erstellen des Trainers.')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/trainers" className="text-sm text-[#797D83] hover:text-[#EDECEA] transition-colors">
          ← Zurück zu Trainern
        </Link>
        <h1 className="text-2xl font-bold text-[#EDECEA] mt-3">Neuen Trainer erstellen</h1>
        <p className="text-[#797D83] text-sm mt-1">
          Legt ein Trainer-Konto mit App-Zugang an.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#111318] border border-white/[0.08] rounded-2xl shadow-lg p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Vollständiger Name
          </label>
          <input
            id="full_name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            autoFocus
            placeholder="Max Mustermann"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#797D83] mb-1.5">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="trainer@example.com"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#797D83] mb-1.5">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={6}
            placeholder="Mindestens 6 Zeichen"
            className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/trainers"
            className="press flex-1 py-2.5 border border-white/[0.08] text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.04] text-sm font-medium rounded-xl transition-colors text-center"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="press flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Wird erstellt…' : 'Trainer erstellen'}
          </button>
        </div>
      </form>
    </div>
  )
}
