'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/components/Motion'
import { resolveImageUrl } from '@/lib/exercises'

type SetLog = {
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
  name: string
  description: string | null
  sortOrder: number
}

type BackendExerciseLog = {
  id: string
  workoutLogId: string
  exerciseId: string
  actualWeight: number | null
  actualReps: string | null
  setsDone: number | null
  completed: boolean
  createdAt: string
}

type BackendWorkoutLog = {
  id: string
  dayId: string
  date: string
  completedAt: string | null
  durationSeconds: number | null
  createdAt: string
}

type ExerciseWithImage = BackendExercise

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export default function WorkoutPlayerPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const freshStart = searchParams.get('fresh') === '1'

  const [workout, setWorkout] = useState<BackendDay | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithImage[]>([])
  const [logs, setLogs] = useState<Record<string, SetLog[]>>({})
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null)
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingProgress, setSyncingProgress] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  const [elapsed, setElapsed] = useState(0)
  const [finalDurationSeconds, setFinalDurationSeconds] = useState(0)
  const startedAtRef = useRef<number>(0)

  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [swapReason, setSwapReason] = useState('')
  const [swapSending, setSwapSending] = useState(false)
  const [swapSent, setSwapSent] = useState<string | null>(null)

  const [bulkKgOpen, setBulkKgOpen] = useState(false)
  const [bulkKgValue, setBulkKgValue] = useState('')
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (complete) return
    const interval = setInterval(() => {
      if (startedAtRef.current > 0) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [complete])

  useEffect(() => {
    const load = async () => {
      try {
        const playRes = await fetch(`/api/backend/me/workouts/${id}/play`, { cache: 'no-store' })
        if (playRes.status === 401) { router.push('/login'); return }
        if (!playRes.ok) { router.push('/client/plan'); return }

        const playData = await playRes.json() as {
          day: BackendDay & { exercises: BackendExercise[] }
          exercises: BackendExercise[]
          workoutLog: BackendWorkoutLog | null
          exerciseLogs: BackendExerciseLog[]
        }

        if (!playData.day) { router.push('/client/plan'); return }
        setWorkout(playData.day)
        const exerciseList = playData.exercises
        setExercises(exerciseList)

        const logRes = await fetch('/api/backend/me/workout-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayId: id, fresh: freshStart }),
        })
        if (logRes.status === 401) { router.push('/login'); return }
        if (!logRes.ok) { router.push('/client/plan'); return }

        const logData = await logRes.json() as { workoutLog: BackendWorkoutLog; resumed: boolean }
        const wLog = logData.workoutLog
        setWorkoutLogId(wLog.id)
        if (wLog.createdAt) {
          startedAtRef.current = new Date(wLog.createdAt).getTime()
        }

        // Use exercise logs from play response when resuming an existing incomplete log
        const sourceLogs = (logData.resumed && !freshStart) ? playData.exerciseLogs : []

        const logsByExercise: Record<string, BackendExerciseLog[]> = {}
        sourceLogs.forEach(log => {
          logsByExercise[log.exerciseId] = [...(logsByExercise[log.exerciseId] ?? []), log]
        })

        const initialLogs: Record<string, SetLog[]> = {}
        exerciseList.forEach(exercise => {
          const previous = logsByExercise[exercise.id] ?? []
          const setCount = Math.max(1, exercise.sets)

          initialLogs[exercise.id] = Array.from({ length: setCount }, (_, index) => {
            const setNumber = index + 1
            const previousSet = previous.find(log => log.setsDone === setNumber) ?? previous[index]
            return {
              weight: previousSet?.actualWeight?.toString() ?? exercise.targetWeightKg?.toString() ?? '',
              reps: previousSet?.actualReps ?? exercise.reps,
              completed: previousSet?.completed ?? false,
            }
          })
        })

        setLogs(initialLogs)
        setLoading(false)
      } catch (err) {
        console.error('Failed to load workout', err)
        setError('Workout konnte nicht geladen werden.')
        setLoading(false)
      }
    }

    load()
  }, [id, router, freshStart])

  const updateSet = (exerciseId: string, setIndex: number, field: keyof SetLog, value: string | boolean) => {
    setLogs(prev => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((set, index) => (
        index === setIndex ? { ...set, [field]: value } : set
      )),
    }))
  }

  const persistProgress = useCallback(async () => {
    if (!workoutLogId || loading || complete || saving) return
    setSyncingProgress(true)

    try {
      const sets = exercises.flatMap(exercise =>
        (logs[exercise.id] ?? []).map((set, index) => ({
          exerciseId: exercise.id,
          setsDone: index + 1,
          actualWeight: set.weight ? parseFloat(set.weight) : null,
          actualReps: set.reps || null,
          completed: set.completed,
          note: null,
        })),
      )

      await fetch(`/api/backend/me/workout-logs/${workoutLogId}/exercise-logs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sets }),
      })
    } catch (syncError) {
      console.error('Failed to sync workout progress', syncError)
    } finally {
      setSyncingProgress(false)
    }
  }, [workoutLogId, loading, complete, saving, exercises, logs])

  useEffect(() => {
    if (!workoutLogId || loading || complete || saving) return
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current)
    autosaveTimeoutRef.current = setTimeout(() => {
      void persistProgress()
    }, 450)

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [logs, workoutLogId, loading, complete, saving, persistProgress])

  const saveWorkout = async () => {
    if (!workoutLogId) return

    setSaving(true)
    setError('')

    const completedAtMs = Date.now()
    const durationSeconds = startedAtRef.current > 0
      ? Math.floor((completedAtMs - startedAtRef.current) / 1000)
      : elapsed

    try {
      // Final flush of all sets before completing
      const sets = exercises.flatMap(exercise =>
        (logs[exercise.id] ?? []).map((set, index) => ({
          exerciseId: exercise.id,
          setsDone: index + 1,
          actualWeight: set.weight ? parseFloat(set.weight) : null,
          actualReps: set.reps || null,
          completed: set.completed,
          note: null,
        })),
      )

      await fetch(`/api/backend/me/workout-logs/${workoutLogId}/exercise-logs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sets }),
      })

      const patchRes = await fetch(`/api/backend/me/workout-logs/${workoutLogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds }),
      })

      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({})) as { message?: string }
        setError(errData.message ?? 'Fehler beim Speichern.')
        setSaving(false)
        return
      }

      setFinalDurationSeconds(durationSeconds)
      setSaving(false)
      setComplete(true)
      showToast('Workout gespeichert ✓', 'success')
    } catch (err) {
      console.error('Failed to save workout', err)
      setError('Workout konnte nicht gespeichert werden.')
      setSaving(false)
    }
  }

  const handleSwapRequest = async () => {
    if (!exercise || !swapReason.trim()) return
    setSwapSending(true)
    setError('')

    try {
      const res = await fetch('/api/backend/me/exercise-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayId: id, exerciseId: exercise.id, reason: swapReason.trim() }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { message?: string }
        setError(errData.message ?? 'Fehler beim Senden.')
        setSwapSending(false)
        return
      }

      setSwapSending(false)
      setSwapModalOpen(false)
      setSwapReason('')
      setSwapSent(exercise.id)
      showToast('Anfrage gesendet ✓', 'info')
    } catch (err) {
      console.error('Failed to send swap request', err)
      setError('Anfrage konnte nicht gesendet werden.')
      setSwapSending(false)
    }
  }

  useEffect(() => { setBulkKgOpen(false) }, [currentExerciseIndex])

  // Auto-advance when all sets done
  useEffect(() => {
    if (loading || complete || saving) return
    const exercise = exercises[currentExerciseIndex]
    if (!exercise) return
    const sets = logs[exercise.id]
    if (!sets || sets.length === 0) return
    if (!sets.every(s => s.completed)) return

    if (currentExerciseIndex >= exercises.length - 1) {
      saveWorkout()
    } else {
      const t = setTimeout(() => {
        setCurrentExerciseIndex(i => i + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 400)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, currentExerciseIndex, exercises, loading, complete, saving])

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center p-12 bg-[#050504] min-h-screen">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const exercise = exercises[currentExerciseIndex]
  const exerciseSets = exercise ? logs[exercise.id] ?? [] : []
  const completedCount = exerciseSets.filter(s => s.completed).length
  const progress = exercises.length > 0 ? (currentExerciseIndex / exercises.length) * 100 : 0
  const activeSetIndex = exerciseSets.findIndex(s => !s.completed)

  const applyBulkKg = () => {
    if (!exercise) return
    exerciseSets.forEach((_, i) => updateSet(exercise.id, i, 'weight', bulkKgValue))
    setBulkKgOpen(false)
  }

  // ── No exercises ─────────────────────────────────────────────────────────

  if (!exercise && !complete) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-[#050504] min-h-screen">
        <p className="text-[#EDECEA] font-semibold mb-2">Keine Übungen gefunden</p>
        <Link href="/client/plan" className="text-[#A78BFA] text-sm">Zurück zum Plan</Link>
      </div>
    )
  }

  // ── Complete screen ──────────────────────────────────────────────────────

  if (complete) {
    const completedSets = Object.values(logs).flat().filter(s => s.completed).length
    const totalSets = Object.values(logs).flat().length

    return (
      <div className="min-h-screen bg-[#A78BFA] flex flex-col items-center justify-center p-6 text-white">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-6 neon-glow">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Geschafft!</p>
        <h1 className="text-3xl font-bold text-center mb-1">Training abgeschlossen</h1>
        <p className="text-white/70 text-sm mb-10">{workout?.name}</p>

        <div className="w-full max-w-sm bg-white/15 rounded-3xl p-6 grid grid-cols-2 gap-5 mb-4 border border-white/20">
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">{formatTime(finalDurationSeconds)}</div>
            <div className="text-white/60 text-sm mt-1">Dauer</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{exercises.length}</div>
            <div className="text-white/60 text-sm mt-1">Übungen</div>
          </div>
          <div className="text-center col-span-2">
            <div className="text-3xl font-bold">{completedSets}<span className="text-lg font-normal text-white/60"> / {totalSets} Sätze</span></div>
            <div className="text-white/60 text-sm mt-1">Erledigte Sätze</div>
          </div>
        </div>

        <div className="w-full max-w-sm mt-6">
          <Link
            href="/client"
            className="w-full py-4 bg-[#050504] text-[#A78BFA] font-bold rounded-2xl text-center block hover:bg-[#111111] transition-colors"
          >
            Zurück zum Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // ── Active player ────────────────────────────────────────────────────────

  return (
    <div className="bg-[#050504] min-h-screen">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#0b0c0f]/95 backdrop-blur-md border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between mb-2 max-w-lg mx-auto">
          <Link href="/client/plan" className="text-[#797D83] hover:text-[#EDECEA] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="text-center">
            <p className="text-xs text-[#797D83] font-medium">{workout?.name}</p>
            <p className="text-sm text-[#EDECEA] font-semibold">
              Übung {currentExerciseIndex + 1} von {exercises.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#797D83]">Zeit</p>
            <p className="text-sm font-bold text-[#A78BFA] tabular-nums">{formatTime(elapsed)}</p>
          </div>
        </div>
        <div className="max-w-lg mx-auto text-[11px] text-[#797D83] mb-2 text-right">
          {syncingProgress ? 'Speichert…' : 'Fortschritt wird automatisch gespeichert'}
        </div>
        <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden max-w-lg mx-auto">
          <div
            className="h-full bg-[#A78BFA] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(167,139,250,0.6)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <main className="p-4 pb-24 max-w-lg mx-auto space-y-4">

        {/* Exercise thumbnail strip */}
        {exercises.length > 1 && (
          <div className="-mx-4 px-4 overflow-x-auto">
            <div className="flex gap-2 min-w-max py-1">
              {exercises.map((ex, i) => {
                const sets = logs[ex.id] ?? []
                const allDone = sets.length > 0 && sets.every(s => s.completed)
                const isActive = i === currentExerciseIndex
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setCurrentExerciseIndex(i)}
                    aria-label={ex.name}
                    className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                      isActive
                        ? 'border-[#A78BFA] ring-2 ring-[#A78BFA]/20 scale-105'
                        : allDone
                          ? 'border-[#A78BFA]/40 opacity-70'
                          : 'border-white/[0.08] opacity-60 hover:opacity-100'
                    }`}
                  >
                    {resolveImageUrl(ex.imageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveImageUrl(ex.imageUrl)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center text-[#797D83] text-[9px] font-bold uppercase px-1 text-center leading-tight">
                        {ex.name.slice(0, 8)}
                      </div>
                    )}
                    {allDone && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#A78BFA] flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Exercise name + trainer targets */}
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] px-5 py-4">
          <h1 className="text-2xl font-bold text-[#EDECEA] mb-1">{exercise.name}</h1>
          <p className="text-[#A78BFA] text-sm font-medium">
            {exercise.sets} Sätze × {exercise.reps}
            {exercise.targetWeightKg ? ` · ${exercise.targetWeightKg} kg` : ''}
          </p>
          {exercise.note && (
            <p className="text-[#797D83] text-sm mt-2">💡 {exercise.note}</p>
          )}
          {swapSent === exercise.id ? (
            <p className="mt-3 text-xs text-[#797D83]">✓ Anfrage gesendet — dein Trainer wird sie prüfen.</p>
          ) : (
            <button
              type="button"
              onClick={() => { setSwapReason(''); setError(''); setSwapModalOpen(true) }}
              className="mt-3 text-xs text-[#797D83] hover:text-[#A78BFA] underline underline-offset-2 transition-colors"
            >
              Übung tauschen anfragen
            </button>
          )}
        </div>

        {/* Sets table */}
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
          {/* Column headers */}
          <div className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 px-3 pt-3 pb-2">
            <div className="flex flex-col items-center gap-0.5">
              <svg className="w-3 h-3 text-[#797D83]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] font-semibold text-[#797D83]">#</span>
            </div>
            {/* KG with pencil — tap to bulk-edit */}
            <button
              type="button"
              onClick={() => { setBulkKgOpen(v => !v); setBulkKgValue(exerciseSets[0]?.weight ?? '') }}
              className="flex items-center justify-center gap-1 group"
            >
              <span className="text-[10px] font-semibold text-[#797D83] group-hover:text-[#A78BFA] transition-colors">KG</span>
              <svg className="w-3 h-3 text-[#797D83]/50 group-hover:text-[#A78BFA] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <span className="text-[10px] font-semibold text-[#797D83] text-center">WDH</span>
            <div className="flex items-center justify-center gap-0.5">
              <span className="text-[10px] font-semibold text-[#797D83]">10RM</span>
              <svg className="w-3 h-3 text-[#797D83]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <span />
          </div>

          {/* Bulk KG row */}
          {bulkKgOpen && (
            <div className="flex items-center gap-2 px-3 pb-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={bulkKgValue}
                onChange={e => setBulkKgValue(e.target.value)}
                placeholder="kg für alle Sätze"
                autoFocus
                className="flex-1 px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-xl text-sm text-center font-semibold text-[#EDECEA] placeholder-[#797D83] focus:ring-2 focus:ring-[#A78BFA]/40 focus:border-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={applyBulkKg}
                className="px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-xs font-bold rounded-xl transition-colors"
              >
                Alle setzen
              </button>
            </div>
          )}

          <div className="mx-3 border-t border-white/[0.06]" />

          {/* Set rows */}
          <div className="py-2 space-y-1">
            {exerciseSets.map((set, setIndex) => {
              const isActive = setIndex === activeSetIndex
              const orm = calc1RM(set.weight, set.reps)

              if (isActive) {
                return (
                  <div
                    key={setIndex}
                    className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 bg-[#A78BFA]/[0.08] rounded-2xl px-2 py-2 border border-[#A78BFA]/[0.12]"
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#A78BFA] shadow-[0_0_6px_rgba(167,139,250,0.8)]" />
                      <span className="text-sm font-bold text-[#EDECEA] tabular-nums">{setIndex + 1}</span>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0"
                      value={set.weight}
                      onChange={e => updateSet(exercise.id, setIndex, 'weight', e.target.value)}
                      placeholder="—"
                      className="w-full px-2 py-2 bg-white/[0.07] rounded-xl text-sm text-center font-bold text-[#EDECEA] tabular-nums border border-white/[0.08] focus:ring-2 focus:ring-[#A78BFA]/40 focus:border-[#A78BFA]/30 focus:outline-none"
                    />
                    <span className="text-sm font-bold text-[#EDECEA] text-center tabular-nums">{set.reps}</span>
                    <span className="text-xs font-medium text-[#A78BFA] text-center tabular-nums">{orm}</span>
                    <button
                      type="button"
                      aria-label={`Satz ${setIndex + 1} abhaken`}
                      onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                      className="w-9 h-9 rounded-full bg-[#A78BFA] hover:bg-[#B79FFB] flex items-center justify-center text-[#050504] transition-colors shadow-[0_4px_12px_rgba(167,139,250,0.4)] mx-auto"
                    >
                      <CheckIcon />
                    </button>
                  </div>
                )
              }

              if (set.completed) {
                return (
                  <div
                    key={setIndex}
                    className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 px-2 py-2"
                  >
                    <span className="text-sm font-semibold text-[#A78BFA] text-center tabular-nums">{setIndex + 1}</span>
                    <span className="text-sm text-[#797D83] text-center tabular-nums">{set.weight || '—'}</span>
                    <span className="text-sm text-[#797D83] text-center tabular-nums">{set.reps}</span>
                    <span className="text-xs text-[#797D83] text-center tabular-nums">{orm}</span>
                    <button
                      type="button"
                      aria-label={`Satz ${setIndex + 1} rückgängig`}
                      onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                      className="w-9 h-9 rounded-full bg-[#A78BFA]/10 flex items-center justify-center text-[#A78BFA] transition-colors mx-auto"
                    >
                      <CheckIcon />
                    </button>
                  </div>
                )
              }

              return (
                <div
                  key={setIndex}
                  className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 px-2 py-2"
                >
                  <span className="text-sm text-[#797D83] text-center tabular-nums">{setIndex + 1}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    value={set.weight}
                    onChange={e => updateSet(exercise.id, setIndex, 'weight', e.target.value)}
                    placeholder="—"
                    className="w-full px-2 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-center text-[#797D83] tabular-nums focus:ring-1 focus:ring-[#A78BFA]/30 focus:outline-none"
                  />
                  <span className="text-sm text-[#797D83] text-center tabular-nums">{set.reps}</span>
                  <span className="text-xs text-[#797D83]/40 text-center">—</span>
                  <button
                    type="button"
                    disabled
                    className="w-9 h-9 rounded-full border-2 border-white/[0.08] flex items-center justify-center text-transparent mx-auto cursor-not-allowed opacity-30"
                  >
                    <CheckIcon />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="pb-3 text-center text-xs text-[#797D83]">
            {completedCount === exerciseSets.length
              ? (currentExerciseIndex >= exercises.length - 1
                  ? (saving ? 'Wird gespeichert…' : 'Workout wird abgeschlossen…')
                  : 'Nächste Übung…')
              : `${completedCount} / ${exerciseSets.length} Sätze erledigt`}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

      </main>

      {/* Swap request modal */}
      {swapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#111111] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <p className="text-xs text-[#797D83] mb-0.5">{exercise.name}</p>
              <h2 className="font-semibold text-[#EDECEA]">Übung tauschen anfragen</h2>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-[#797D83] mb-2">
                Warum möchtest du diese Übung tauschen?
              </label>
              <textarea
                value={swapReason}
                onChange={e => setSwapReason(e.target.value)}
                placeholder="z.B. Schmerzen im Schultergelenk, kein passendes Gerät…"
                rows={4}
                autoFocus
                className="w-full px-4 py-3 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:ring-2 focus:ring-[#A78BFA]/30 focus:border-[#A78BFA]/30 focus:outline-none resize-none transition"
              />
              {error && (
                <div className="mt-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => setSwapModalOpen(false)}
                className="flex-1 py-3 border border-white/[0.08] text-[#797D83] font-medium rounded-xl hover:bg-white/[0.04] transition-colors text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSwapRequest}
                disabled={!swapReason.trim() || swapSending}
                className="flex-1 py-3 bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-40 text-[#050504] font-semibold rounded-xl transition-colors text-sm"
              >
                {swapSending ? 'Wird gesendet…' : 'Anfrage senden'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
