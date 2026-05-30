'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'preview' | 'active' | 'complete'

interface LogEntry {
  weight: string
  reps: string
  completed: boolean
}

type BackendExercise = {
  id: string
  dayId: string
  name: string
  description: string | null
  sets: number
  reps: string
  targetWeightKg: number | null
  restSeconds: number | null
  note: string | null
  sortOrder: number
  imageUrl: string | null
  libraryId: string | null
}

type BackendDay = {
  id: string
  planId: string
  name: string
  description: string | null
  sortOrder: number
  exercises: BackendExercise[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function calc1RM(weight: string, reps: string): string {
  const w = parseFloat(weight)
  const r = parseInt(reps)
  if (!w || !r || isNaN(w) || isNaN(r) || r <= 0) return '—'
  return (w * (1 + r / 30)).toFixed(1)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkoutDayPage() {
  const { dayId } = useParams<{ dayId: string }>()
  const router = useRouter()

  // Data
  const [day, setDay] = useState<BackendDay | null>(null)
  const [exercises, setExercises] = useState<BackendExercise[]>([])
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Phase & timer
  const [phase, setPhase] = useState<Phase>('preview')
  const [startedAt] = useState<Date | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [finalDuration, setFinalDuration] = useState(0)

  // Save
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/backend/me/plan-days/${dayId}`, { cache: 'no-store' })

        if (res.status === 401) {
          setErrorMessage('Bitte melde dich an, um dein Training zu sehen.')
          setLoading(false)
          return
        }

        if (res.status === 404) {
          router.push('/client/plan')
          return
        }

        if (!res.ok) throw new Error(`plan-days: ${res.status}`)

        const data = await res.json() as { day: BackendDay; exerciseLogs: [] }

        const exList = data.day.exercises ?? []
        setDay(data.day)
        setExercises(exList)

        // Initialize logs from trainer targets.
        // exerciseLogs are deferred until WorkoutLog model is migrated.
        const init: Record<string, LogEntry[]> = {}
        exList.forEach(ex => {
          init[ex.id] = Array.from({ length: Math.max(1, ex.sets) }, () => ({
            weight: ex.targetWeightKg?.toString() ?? '',
            reps: ex.reps,
            completed: false,
          }))
        })
        setLogs(init)
        setLoading(false)
      } catch (err) {
        console.error('Failed to load workout day', err)
        setErrorMessage('Das Training konnte nicht geladen werden.')
        setLoading(false)
      }
    }
    load()
  }, [dayId, router])

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !startedAt) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [phase, startedAt])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStart = () => {
    router.push(`/client/workout/${dayId}/play`)
  }

  const updateSetLog = (exId: string, setIndex: number, field: keyof LogEntry, value: string | boolean) =>
    setLogs(prev => ({
      ...prev,
      [exId]: prev[exId].map((set, index) => (
        index === setIndex ? { ...set, [field]: value } : set
      )),
    }))

  const handleComplete = async () => {
    // workout_log and exercise_log writes are deferred — handled by the play page
    setSaving(true)
    setError('')
    const duration = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0
    setFinalDuration(duration)
    setSaving(false)
    setPhase('complete')
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {errorMessage}
        </div>
        <Link href="/client/plan" className="text-sm text-[#A78BFA]">← Zurück zum Plan</Link>
      </div>
    )
  }

  const completedCount    = exercises.filter(ex => logs[ex.id]?.every(set => set.completed)).length
  const totalSets         = exercises.reduce((acc, ex) => acc + (logs[ex.id]?.length || ex.sets), 0)
  const totalTrainerSets  = exercises.reduce((acc, ex) => acc + ex.sets, 0)

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 1 — Preview
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'preview') return (
    <div className="p-4 max-w-lg mx-auto pb-8">

      <Link href="/client/plan" className="inline-flex items-center gap-1.5 text-sm text-[#797D83] mb-6">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurück
      </Link>

      <div className="mb-6">
        <span className="inline-block bg-[#A78BFA]/10 text-[#A78BFA] text-xs font-semibold px-3 py-1 rounded-full mb-3">
          💪 Bereit zum Training
        </span>
        <h1 className="text-3xl font-bold text-[#EDECEA]">{day?.name}</h1>
        {day?.description && <p className="text-[#797D83] mt-1 text-sm">{day.description}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#EDECEA]">{exercises.length}</div>
          <div className="text-sm text-[#797D83] mt-1">Übungen</div>
        </div>
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#EDECEA]">{totalTrainerSets}</div>
          <div className="text-sm text-[#797D83] mt-1">Sätze gesamt</div>
        </div>
      </div>

      {/* Exercise list preview */}
      <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden mb-8">
        {exercises.map((ex, i) => (
          <div key={ex.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}>
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-bold text-[#797D83] flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[#EDECEA] text-sm">{ex.name}</div>
              <div className="text-xs text-[#797D83] mt-0.5">
                {ex.sets} Sätze × {ex.reps}
                {ex.targetWeightKg ? ` · ${ex.targetWeightKg} kg` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleStart}
        className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-2xl transition-colors shadow-lg shadow-emerald-100"
      >
        Training starten →
      </button>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 2 — Active workout
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'active') return (
    <div>
      {/* Sticky header: timer + progress */}
      <div className="sticky top-0 z-10 bg-white border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between mb-2 max-w-lg mx-auto">
          <div>
            <div className="font-bold text-[#EDECEA] text-sm">{day?.name}</div>
            <div className="text-xs text-[#797D83]">{completedCount} / {exercises.length} Übungen</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-[#A78BFA] tabular-nums">{formatTime(elapsed)}</div>
            <div className="text-xs text-[#797D83]">Trainingszeit</div>
          </div>
        </div>
        <div className="bg-gray-100 rounded-full h-1.5 max-w-lg mx-auto">
          <div
            className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: exercises.length > 0 ? `${(completedCount / exercises.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Exercise cards */}
      <div className="p-4 space-y-3 pb-36 max-w-lg mx-auto">
        {exercises.map((ex, i) => {
          const sets = logs[ex.id]
          if (!sets) return null
          const exerciseCompleted = sets.every(set => set.completed)

          return (
            <div
              key={ex.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${
                exerciseCompleted ? 'border-emerald-200' : 'border-white/[0.06]'
              }`}
            >
              {/* Header */}
              <div className={`flex items-start gap-3 px-4 py-4 ${exerciseCompleted ? 'bg-emerald-50' : ''}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                  exerciseCompleted ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-[#797D83]'
                }`}>
                  {exerciseCompleted ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#EDECEA]">{ex.name}</div>
                  <div className="text-xs text-[#797D83] mt-0.5 flex flex-wrap gap-x-3">
                    <span>Vorgabe: {ex.sets}×{ex.reps}</span>
                    {ex.targetWeightKg && <span>{ex.targetWeightKg} kg</span>}
                  </div>
                  {ex.note && <div className="text-xs text-[#A78BFA] mt-1">💡 {ex.note}</div>}
                </div>
              </div>

              {/* Set inputs */}
              <div className="pb-3">
                {/* Column headers */}
                <div className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 px-4 pt-1 pb-2">
                  <div className="flex flex-col items-center gap-0.5">
                    <svg className="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[10px] font-semibold text-[#797D83]">#</span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#797D83] text-center">KG</span>
                  <span className="text-[10px] font-semibold text-[#797D83] text-center">WDH</span>
                  <span className="text-[10px] font-semibold text-[#797D83] text-center">10RM</span>
                  <span />
                </div>

                <div className="space-y-1 px-1">
                  {(() => {
                    const activeSetIndex = sets.findIndex(s => !s.completed)
                    return sets.map((set, setIndex) => {
                      const isActive = setIndex === activeSetIndex
                      const orm = calc1RM(set.weight, set.reps)
                      if (isActive) {
                        return (
                          <div key={setIndex} className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 bg-blue-50 rounded-2xl px-2 py-2">
                            <div className="relative flex items-center justify-center">
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                              <span className="text-sm font-bold text-[#EDECEA] tabular-nums">{setIndex + 1}</span>
                            </div>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={set.weight}
                              onChange={e => updateSetLog(ex.id, setIndex, 'weight', e.target.value)}
                              placeholder="—"
                              className="w-full px-2 py-2 bg-white rounded-xl text-sm text-center font-bold text-[#EDECEA] tabular-nums shadow-sm border-0 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-[#EDECEA] text-center tabular-nums">{set.reps}</span>
                            <span className="text-xs font-medium text-blue-500 text-center tabular-nums">{orm}</span>
                            <button
                              type="button"
                              onClick={() => updateSetLog(ex.id, setIndex, 'completed', !set.completed)}
                              className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition-colors shadow-sm mx-auto"
                            >
                              <CheckIcon />
                            </button>
                          </div>
                        )
                      }
                      if (set.completed) {
                        return (
                          <div key={setIndex} className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 px-2 py-2">
                            <span className="text-sm font-semibold text-emerald-500 text-center tabular-nums">{setIndex + 1}</span>
                            <span className="text-sm text-[#797D83] text-center tabular-nums">{set.weight || '—'}</span>
                            <span className="text-sm text-[#797D83] text-center tabular-nums">{set.reps}</span>
                            <span className="text-xs text-[#797D83] text-center tabular-nums">{orm}</span>
                            <button
                              type="button"
                              onClick={() => updateSetLog(ex.id, setIndex, 'completed', !set.completed)}
                              className="w-9 h-9 rounded-full bg-[#A78BFA]/10 flex items-center justify-center text-emerald-500 mx-auto"
                            >
                              <CheckIcon />
                            </button>
                          </div>
                        )
                      }
                      return (
                        <div key={setIndex} className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 px-2 py-2">
                          <span className="text-sm text-[#797D83] text-center tabular-nums">{setIndex + 1}</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={set.weight}
                            onChange={e => updateSetLog(ex.id, setIndex, 'weight', e.target.value)}
                            placeholder="—"
                            className="w-full px-2 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-center text-[#797D83] tabular-nums focus:ring-1 focus:ring-gray-300 focus:outline-none"
                          />
                          <span className="text-sm text-[#797D83] text-center tabular-nums">{set.reps}</span>
                          <span className="text-xs text-gray-300 text-center">—</span>
                          <button
                            type="button"
                            disabled
                            className="w-9 h-9 rounded-full border-2 border-white/[0.06] flex items-center justify-center text-transparent mx-auto cursor-not-allowed opacity-40"
                          >
                            <CheckIcon />
                          </button>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          )
        })}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* Fixed CTA — sits above the client bottom nav (~64px tall) */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 pt-3 bg-white/90 backdrop-blur border-t border-white/[0.06]">
        <button
          onClick={handleComplete}
          disabled={saving}
          className="w-full max-w-lg mx-auto block py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors text-base"
        >
          {saving ? 'Wird gespeichert…' : 'Workout abschließen ✓'}
        </button>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 3 — Completion screen
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center p-6 text-white">
      <div className="text-7xl mb-6">🏆</div>

      <h1 className="text-3xl font-bold text-center mb-1">Stark gemacht!</h1>
      <p className="text-emerald-200 text-center mb-10">{day?.name} abgeschlossen</p>

      <div className="w-full max-w-sm bg-white/15 rounded-3xl p-6 grid grid-cols-2 gap-5 mb-10">
        <div className="text-center">
          <div className="text-3xl font-bold tabular-nums">{formatTime(finalDuration)}</div>
          <div className="text-emerald-200 text-sm mt-1">Dauer</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold">{exercises.length}</div>
          <div className="text-emerald-200 text-sm mt-1">Übungen</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold">{completedCount}</div>
          <div className="text-emerald-200 text-sm mt-1">Abgehakt</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold">{totalSets}</div>
          <div className="text-emerald-200 text-sm mt-1">Sätze</div>
        </div>
      </div>

      <Link
        href="/client"
        className="w-full max-w-sm py-4 bg-white text-[#A78BFA] font-bold rounded-2xl text-center block hover:bg-emerald-50 transition-colors"
      >
        Zurück zum Dashboard
      </Link>
    </div>
  )
}
