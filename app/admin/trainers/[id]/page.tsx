'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

type TrainerDetail = {
  id: string
  fullName: string
  email: string
  isActive: boolean
  stats: { clients: number; workoutPlans: number; nutritionPlans: number }
}

export default function EditTrainerPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const trainerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [trainer, setTrainer] = useState<TrainerDetail | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    if (!trainerId) return
    try {
      setLoadError('')
      const response = await fetch(`/api/backend/trainers/${trainerId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as { trainer?: TrainerDetail; message?: string } | null

      if (response.status === 404) {
        router.replace('/admin/trainers')
        return
      }
      if (!response.ok || !payload?.trainer) {
        setLoadError(response.status === 401 ? 'Backend-Login erforderlich.' : 'Trainer konnte nicht geladen werden.')
        return
      }

      const t = payload.trainer
      setTrainer(t)
      setFullName(t.fullName ?? '')
      setEmail(t.email ?? '')
      setIsActive(t.isActive)
    } catch {
      setLoadError('Trainer konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [trainerId, router])

  useEffect(() => { void load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFlash('')

    if (!fullName.trim()) {
      setError('Name ist erforderlich.')
      return
    }
    if (!isValidEmail(email.trim())) {
      setError('Gültige E-Mail erforderlich.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/backend/trainers/${trainerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          isActive,
        }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null

      if (!response.ok) {
        if (response.status === 401) setError('Backend-Login erforderlich.')
        else setError(payload?.message ?? payload?.error ?? 'Speichern fehlgeschlagen.')
        setSaving(false)
        return
      }

      setFlash('✓ Gespeichert')
      setTrainer(prev => prev ? { ...prev, fullName: fullName.trim(), email: email.trim(), isActive } : prev)
      setTimeout(() => setFlash(''), 2500)
    } catch {
      setError('Netzwerkfehler beim Speichern.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Link href="/admin/trainers" className="text-sm text-[#797D83] hover:text-[#EDECEA] transition-colors">
          ← Zurück zu Trainern
        </Link>
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {loadError}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/trainers" className="text-sm text-[#797D83] hover:text-[#EDECEA] transition-colors">
          ← Zurück zu Trainern
        </Link>
        <h1 className="text-2xl font-bold text-[#EDECEA] mt-3">Trainer bearbeiten</h1>
        <p className="text-[#797D83] text-sm mt-1">{trainer?.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Kunden', value: trainer?.stats.clients ?? 0 },
          { label: 'Pläne', value: trainer?.stats.workoutPlans ?? 0 },
          { label: 'Ernährung', value: trainer?.stats.nutritionPlans ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-[#EDECEA] tabular-nums">{s.value}</div>
            <div className="text-[#797D83] text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-[#111318] border border-white/[0.08] rounded-2xl shadow-lg p-6 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
        {flash && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl">
            {flash}
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

        {/* Active toggle */}
        <div className="flex items-center justify-between rounded-xl bg-[#0b0c0f] border border-white/[0.08] px-4 py-3">
          <div>
            <div className="text-sm font-medium text-[#EDECEA]">Aktiv</div>
            <div className="text-xs text-[#797D83] mt-0.5">Inaktive Trainer können sich nicht anmelden.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive(v => !v)}
            className={`press relative w-12 h-7 rounded-full transition-colors shrink-0 ${isActive ? 'bg-[#A78BFA]' : 'bg-white/[0.12]'}`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : ''}`} />
          </button>
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
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  )
}
