'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { WorkoutDay, Exercise, ExerciseLog } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'preview' | 'active' | 'complete'

interface LogEntry {
  weight: string
  reps: string
  completed: boolean
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
  const [day, setDay] = useState<WorkoutDay | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [clientId, setClientId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null)
  const [existingLogs, setExistingLogs] = useState<Record<string, Record<number, ExerciseLog>>>({})
  const [loading, setLoading] = useState(true)

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: cl } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (!cl) { setLoading(false); return }
      setClientId(cl.id)

      const { data: activeAssignments, error: assignmentError } = await supabase
        .from('assigned_plans')
        .select('plan_id')
        .eq('client_id', cl.id)
        .eq('is_active', true)
      if (assignmentError) { router.push('/client/plan'); return }

      const planIds = (activeAssignments ?? []).map(a => a.plan_id)
      if (planIds.length === 0) { router.push('/client/plan'); return }

      const [dayRes, exRes] = await Promise.all([
        supabase.from('workout_days').select('*').eq('id', dayId).in('plan_id', planIds).maybeSingle(),
        supabase.from('exercises').select('*').eq('day_id', dayId).order('sort_order'),
      ])

      if (!dayRes.data) { router.push('/client/plan'); return }
      setDay(dayRes.data)

      const exList: Exercise[] = exRes.data ?? []
      setExercises(exList)

      // Resume today's log if it exists
      const today = new Date().toISOString().split('T')[0]
      const { data: existingWLog } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('client_id', cl.id)
        .eq('day_id', dayId)
        .eq('date', today)
        .maybeSingle()

      let prevExLogs: ExerciseLog[] = []
      if (existingWLog) {
        setWorkoutLogId(existingWLog.id)
        const { data: fetched } = await supabase
          .from('exercise_logs')
          .select('*')
          .eq('workout_log_id', existingWLog.id)
        prevExLogs = fetched ?? []
        const map: Record<string, Record<number, ExerciseLog>> = {}
        prevExLogs.forEach((log, index) => {
          const setNumber = log.sets_done ?? index + 1
          map[log.exercise_id] = { ...map[log.exercise_id], [setNumber]: log }
        })
        setExistingLogs(map)
      }

      // Pre-fill from trainer targets or previous log
      const logsByExercise: Record<string, ExerciseLog[]> = {}
      prevExLogs.forEach(log => {
        logsByExercise[log.exercise_id] = [...(logsByExercise[log.exercise_id] ?? []), log]
      })

      const init: Record<string, LogEntry[]> = {}
      exList.forEach(ex => {
        const previous = logsByExercise[ex.id] ?? []
        const legacyLog = previous.length === 1 ? previous[0] : undefined
        const savedSetCount = legacyLog?.sets_done && legacyLog.sets_done > 1 ? legacyLog.sets_done : previous.length
        const setCount = Math.max(1, ex.sets, savedSetCount)

        init[ex.id] = Array.from({ length: setCount }, (_, index) => {
          const setNumber = index + 1
          const prev = previous.find(log => log.sets_done === setNumber) ?? previous[index] ?? legacyLog
          return {
            weight: prev?.actual_weight?.toString() ?? ex.target_weight?.toString() ?? '',
            reps: prev?.actual_reps ?? ex.reps,
            completed: prev?.completed ?? false,
          }
        })
      })
      setLogs(init)
      setLoading(false)
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
    if (!clientId) return
    setSaving(true)
    setError('')

    const duration = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0
    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()

    // Create or update workout_log
    let wLogId = workoutLogId
    if (!wLogId) {
      const { data, error: err } = await supabase
        .from('workout_logs')
        .insert({ client_id: clientId, day_id: dayId, date: today, completed_at: now, duration_seconds: duration })
        .select()
        .single()
      if (err || !data) { setError(err?.message ?? 'Fehler beim Speichern.'); setSaving(false); return }
      wLogId = data.id
      setWorkoutLogId(wLogId)
    } else {
      await supabase
        .from('workout_logs')
        .update({ completed_at: now, duration_seconds: duration })
        .eq('id', wLogId)
    }

    // Upsert exercise_logs
    for (const ex of exercises) {
      const entries = logs[ex.id]
      if (!entries) continue

      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]
        const setNumber = index + 1
        const payload = {
          workout_log_id: wLogId,
          exercise_id:    ex.id,
          actual_weight:  entry.weight ? parseFloat(entry.weight) : null,
          actual_reps:    entry.reps   || null,
          sets_done:      setNumber,
          completed:      entry.completed,
        }
        const existing = existingLogs[ex.id]?.[setNumber]
        if (existing) {
          await supabase.from('exercise_logs').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('exercise_logs').insert(payload)
        }
      }
    }

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

  const completedCount    = exercises.filter(ex => logs[ex.id]?.every(set => set.completed)).length
  const totalSets         = exercises.reduce((acc, ex) => acc + (logs[ex.id]?.length || ex.sets), 0)
  const totalTrainerSets  = exercises.reduce((acc, ex) => acc + ex.sets, 0)

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 1 — Preview
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'preview') return (
    <div className="p-4 max-w-lg mx-auto pb-8">

      <Link href="/client/plan" className="inline-flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurück
      </Link>

      <div className="mb-6">
        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full mb-3">
          💪 Bereit zum Training
        </span>
        <h1 className="text-3xl font-bold text-gray-900">{day?.name}</h1>
        {day?.description && <p className="text-gray-500 mt-1 text-sm">{day.description}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center">
          <div className="text-3xl font-bold text-gray-900">{exercises.length}</div>
          <div className="text-sm text-gray-500 mt-1">Übungen</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-center">
          <div className="text-3xl font-bold text-gray-900">{totalTrainerSets}</div>
          <div className="text-sm text-gray-500 mt-1">Sätze gesamt</div>
        </div>
      </div>

      {/* Exercise list preview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8">
        {exercises.map((ex, i) => (
          <div key={ex.id} className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 text-sm">{ex.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {ex.sets} Sätze × {ex.reps}
                {ex.target_weight ? ` · ${ex.target_weight} kg` : ''}
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
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-2 max-w-lg mx-auto">
          <div>
            <div className="font-bold text-gray-900 text-sm">{day?.name}</div>
            <div className="text-xs text-gray-400">{completedCount} / {exercises.length} Übungen</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{formatTime(elapsed)}</div>
            <div className="text-xs text-gray-400">Trainingszeit</div>
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
                exerciseCompleted ? 'border-emerald-200' : 'border-gray-100'
              }`}
            >
              {/* Header */}
              <div className={`flex items-start gap-3 px-4 py-4 ${exerciseCompleted ? 'bg-emerald-50' : ''}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                  exerciseCompleted ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {exerciseCompleted ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{ex.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                    <span>Vorgabe: {ex.sets}×{ex.reps}</span>
                    {ex.target_weight && <span>{ex.target_weight} kg</span>}
                  </div>
                  {ex.note && <div className="text-xs text-emerald-600 mt-1">💡 {ex.note}</div>}
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
                    <span className="text-[10px] font-semibold text-gray-400">#</span>
                  </div>
                  <span className="text-[10px] font-semibold text-gray-400 text-center">KG</span>
                  <span className="text-[10px] font-semibold text-gray-400 text-center">WDH</span>
                  <span className="text-[10px] font-semibold text-gray-400 text-center">10RM</span>
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
                              <span className="text-sm font-bold text-gray-900 tabular-nums">{setIndex + 1}</span>
                            </div>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={set.weight}
                              onChange={e => updateSetLog(ex.id, setIndex, 'weight', e.target.value)}
                              placeholder="—"
                              className="w-full px-2 py-2 bg-white rounded-xl text-sm text-center font-bold text-gray-900 tabular-nums shadow-sm border-0 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-gray-900 text-center tabular-nums">{set.reps}</span>
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
                            <span className="text-sm text-gray-400 text-center tabular-nums">{set.weight || '—'}</span>
                            <span className="text-sm text-gray-400 text-center tabular-nums">{set.reps}</span>
                            <span className="text-xs text-gray-400 text-center tabular-nums">{orm}</span>
                            <button
                              type="button"
                              onClick={() => updateSetLog(ex.id, setIndex, 'completed', !set.completed)}
                              className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 mx-auto"
                            >
                              <CheckIcon />
                            </button>
                          </div>
                        )
                      }
                      return (
                        <div key={setIndex} className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 px-2 py-2">
                          <span className="text-sm text-gray-400 text-center tabular-nums">{setIndex + 1}</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={set.weight}
                            onChange={e => updateSetLog(ex.id, setIndex, 'weight', e.target.value)}
                            placeholder="—"
                            className="w-full px-2 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm text-center text-gray-400 tabular-nums focus:ring-1 focus:ring-gray-300 focus:outline-none"
                          />
                          <span className="text-sm text-gray-400 text-center tabular-nums">{set.reps}</span>
                          <span className="text-xs text-gray-300 text-center">—</span>
                          <button
                            type="button"
                            disabled
                            className="w-9 h-9 rounded-full border-2 border-gray-100 flex items-center justify-center text-transparent mx-auto cursor-not-allowed opacity-40"
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
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 pt-3 bg-white/90 backdrop-blur border-t border-gray-100">
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
        className="w-full max-w-sm py-4 bg-white text-emerald-700 font-bold rounded-2xl text-center block hover:bg-emerald-50 transition-colors"
      >
        Zurück zum Dashboard
      </Link>
    </div>
  )
}
