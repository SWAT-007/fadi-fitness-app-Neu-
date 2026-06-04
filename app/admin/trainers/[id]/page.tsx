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

  // Password reset
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetFlash, setResetFlash] = useState('')

  // Hard delete
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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

  const handleResetPassword = async () => {
    setResetError('')
    setResetFlash('')
    if (newPassword.length < 6) {
      setResetError('Passwort muss mindestens 6 Zeichen haben.')
      return
    }
    setResetting(true)
    try {
      const response = await fetch(`/api/backend/trainers/${trainerId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null
      if (!response.ok) {
        if (response.status === 401) setResetError('Backend-Login erforderlich.')
        else setResetError(payload?.message ?? payload?.error ?? 'Passwort konnte nicht geändert werden.')
        setResetting(false)
        return
      }
      setNewPassword('')
      setResetFlash('✓ Passwort geändert')
      setTimeout(() => setResetFlash(''), 2500)
    } catch {
      setResetError('Netzwerkfehler beim Zurücksetzen.')
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async () => {
    setDeleteError('')
    setDeleting(true)
    try {
      const response = await fetch(`/api/backend/trainers/${trainerId}/permanent`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null
      if (!response.ok) {
        if (response.status === 401) setDeleteError('Backend-Login erforderlich.')
        else setDeleteError(payload?.error ?? payload?.message ?? 'Trainer konnte nicht gelöscht werden.')
        setDeleting(false)
        return
      }
      router.push('/admin/trainers')
    } catch {
      setDeleteError('Netzwerkfehler beim Löschen.')
      setDeleting(false)
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

      {/* Reset password */}
      <div className="bg-[#111318] border border-white/[0.08] rounded-2xl shadow-lg p-6 mt-5">
        <h2 className="text-sm font-semibold text-[#EDECEA]">Passwort zurücksetzen</h2>
        <p className="text-xs text-[#797D83] mt-1 mb-4">Setzt ein neues Passwort für den Trainer.</p>

        {resetError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-3">
            {resetError}
          </div>
        )}
        {resetFlash && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl mb-3">
            {resetFlash}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            placeholder="Neues Passwort (min. 6 Zeichen)"
            className="flex-1 px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
          />
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetting || newPassword.length < 6}
            className="press shrink-0 px-5 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors disabled:opacity-40"
          >
            {resetting ? 'Setze…' : 'Passwort setzen'}
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-red-500/[0.04] border border-red-500/20 rounded-2xl p-6 mt-5">
        <h2 className="text-sm font-semibold text-red-400">Gefahrenzone</h2>
        <p className="text-xs text-[#797D83] mt-1 mb-4">
          Löscht den Trainer und sein Profil endgültig. Nur möglich, wenn keine Kunden mehr zugeordnet sind.
        </p>
        <button
          type="button"
          onClick={() => { setDeleteError(''); setDeleteOpen(true) }}
          className="press px-5 py-2.5 bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-colors"
        >
          Trainer endgültig löschen
        </button>
      </div>

      {/* Delete confirm modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111111] border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center motion-page-fade">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            </div>
            <h3 className="font-bold text-[#EDECEA] mb-2 text-[17px]">Bist du sicher?</h3>
            <p className="text-[#797D83] text-sm mb-4">
              Das kann nicht rückgängig gemacht werden. Der Trainer und sein Profil werden gelöscht.
            </p>
            {deleteError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-4 text-left">
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="press flex-1 py-3 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-white/[0.04] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="press flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? 'Lösche…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
