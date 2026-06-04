'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatedNumber, StaggerItem } from '@/components/Motion'

type TrainerListItem = {
  id: string
  fullName: string
  email: string
  isActive: boolean
  stats: { clients: number; workoutPlans: number; nutritionPlans: number }
}

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  trainer: <svg viewBox="0 0 24 24" {...stroke}><circle cx="10" cy="8" r="3.25" /><path d="M4 20c0-3.3 2.7-6 6-6c1.15 0 2.23.32 3.15.88" /><path d="M18 13.5l1.07 2.17 2.4.35-1.74 1.7.41 2.38L18 18.97l-2.14 1.13.41-2.38-1.74-1.7 2.4-.35z" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 5v14M5 12h14" /></svg>,
  arrow: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 5l7 7-7 7" /></svg>,
  search: <svg viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5l4 4" /></svg>,
  power: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 4v8" /><path d="M7.5 7a7 7 0 109 0" /></svg>,
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<TrainerListItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState('')

  const loadTrainers = useCallback(async () => {
    try {
      setLoadError('')
      const response = await fetch('/api/backend/trainers', { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as
        | { trainers?: TrainerListItem[] }
        | { message?: string }
        | null

      if (!response.ok) {
        setLoadError(response.status === 401 ? 'Backend-Login erforderlich.' : 'Trainer konnten nicht geladen werden.')
        return
      }

      const list = (payload && 'trainers' in payload ? payload.trainers : []) ?? []
      setTrainers(list.map((t) => ({
        id: t.id,
        fullName: t.fullName ?? 'Unbenannt',
        email: t.email ?? '',
        isActive: t.isActive,
        stats: {
          clients: t.stats?.clients ?? 0,
          workoutPlans: t.stats?.workoutPlans ?? 0,
          nutritionPlans: t.stats?.nutritionPlans ?? 0,
        },
      })))
    } catch {
      setLoadError('Trainer konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTrainers()
    const onFocus = () => { void loadTrainers() }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void loadTrainers() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadTrainers])

  const handleDeactivate = async () => {
    if (!deactivateId) return
    setDeactivating(true)
    setDeactivateError('')
    try {
      const response = await fetch(`/api/backend/trainers/${deactivateId}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null) as { message?: string } | null
      if (!response.ok) {
        setDeactivateError(response.status === 401 ? 'Backend-Login erforderlich.' : payload?.message ?? 'Trainer konnte nicht deaktiviert werden.')
        setDeactivating(false)
        return
      }
      setTrainers((prev) => prev.map((t) => t.id === deactivateId ? { ...t, isActive: false } : t))
      setDeactivateId(null)
    } catch {
      setDeactivateError('Netzwerkfehler beim Deaktivieren.')
    } finally {
      setDeactivating(false)
    }
  }

  const filtered = trainers.filter(t =>
    search.trim() === '' ||
    t.fullName.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-5 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-[#EDECEA] tracking-tight">Trainer</h1>
          <p className="text-[#797D83] text-[13px] mt-0.5">
            <AnimatedNumber value={trainers.length} /> Trainer gesamt
          </p>
        </div>
        <Link
          href="/admin/trainers/new"
          className="press flex items-center gap-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[13px] font-bold px-4 py-2.5 rounded-xl transition-colors"
        >
          <span className="w-4 h-4">{Icon.plus}</span> Neuer Trainer
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#797D83]">{Icon.search}</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Trainer suchen…"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#111111] border border-white/[0.08] text-[#EDECEA] placeholder-[#797D83] focus:border-[#A78BFA]/40 focus:outline-none text-[14px] transition-colors"
        />
      </div>

      {deactivateError && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {deactivateError}
        </div>
      )}
      {loadError && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#797D83] mx-auto mb-3">
            <span className="w-6 h-6">{Icon.trainer}</span>
          </div>
          <p className="text-[#797D83] mb-3">{search ? 'Keine Treffer.' : 'Noch keine Trainer.'}</p>
          {!search && (
            <Link href="/admin/trainers/new" className="press text-[#A78BFA] text-sm hover:text-[#B79FFB] font-medium">
              Ersten Trainer hinzufügen
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((trainer, index) => (
              <li key={trainer.id}>
                <StaggerItem index={index}>
                  <div className="flex items-center group hover:bg-white/[0.03] transition-colors">
                    <Link
                      href={`/admin/trainers/${trainer.id}`}
                      className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        trainer.isActive
                          ? 'bg-[#A78BFA]/15 border border-[#A78BFA]/20 text-[#A78BFA]'
                          : 'bg-white/[0.04] border border-white/[0.08] text-[#797D83]'
                      }`}>
                        {trainer.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#EDECEA] text-[14px] truncate">{trainer.fullName}</span>
                          {trainer.isActive ? (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">Aktiv</span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-white/[0.05] text-[#797D83] border border-white/[0.08]">Inaktiv</span>
                          )}
                        </div>
                        <div className="text-[#797D83] text-[12px] truncate">{trainer.email}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[#797D83] tabular-nums">{trainer.stats.clients} Kunden</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[#797D83] tabular-nums">{trainer.stats.workoutPlans} Pläne</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[#797D83] tabular-nums">{trainer.stats.nutritionPlans} Ernährung</span>
                        </div>
                      </div>
                      <span className="w-4 h-4 text-[#797D83]/30 group-hover:text-[#797D83] flex-shrink-0 mr-2 transition-transform group-hover:translate-x-0.5 self-center">
                        {Icon.arrow}
                      </span>
                    </Link>
                    {trainer.isActive && (
                      <button
                        type="button"
                        onClick={() => { setDeactivateError(''); setDeactivateId(trainer.id) }}
                        className="press p-2 mr-3 rounded-lg text-[#797D83]/40 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                        aria-label="Deaktivieren"
                      >
                        <span className="w-4 h-4 block">{Icon.power}</span>
                      </button>
                    )}
                  </div>
                </StaggerItem>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Deactivate confirm modal */}
      {deactivateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111111] border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center motion-page-fade">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
              <span className="w-6 h-6">{Icon.power}</span>
            </div>
            <h3 className="font-bold text-[#EDECEA] mb-2 text-[17px]">Trainer deaktivieren?</h3>
            <p className="text-[#797D83] text-sm mb-6">
              Der Trainer kann sich nicht mehr anmelden. Konto und zugehörige Daten (Kunden, Pläne) bleiben erhalten.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeactivateId(null)}
                disabled={deactivating}
                className="press flex-1 py-3 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-white/[0.04] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="press flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {deactivating ? 'Deaktiviere…' : 'Deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
