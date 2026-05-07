'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Exercise, ExerciseLog, WorkoutDay } from '@/lib/types'
import { useToast } from '@/components/Motion'

type SetLog = {
  weight: string
  reps: string
  completed: boolean
}

type ExerciseWithImage = Exercise

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

  const [workout, setWorkout] = useState<WorkoutDay | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithImage[]>([])
  const [logs, setLogs] = useState<Record<string, SetLog[]>>({})
  const [existingLogs, setExistingLogs] = useState<Record<string, Record<number, ExerciseLog>>>({})
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientTrainerId, setClientTrainerId] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string>('')
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null)
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [workoutRes, exercisesRes, clientRes] = await Promise.all([
        supabase.from('workout_days').select('*').eq('id', id).single(),
        supabase.from('exercises').select('*').eq('day_id', id).order('sort_order'),
        supabase.from('clients').select('id, trainer_id, full_name').eq('user_id', user.id).maybeSingle(),
      ])

      if (!workoutRes.data) { router.push('/client/plan'); return }

      const exerciseList = (exercisesRes.data ?? []) as ExerciseWithImage[]
      setWorkout(workoutRes.data)
      setExercises(exerciseList)

      const client = clientRes.data
      if (!client) { setLoading(false); return }
      setClientId(client.id)
      setClientTrainerId((client as typeof client & { trainer_id: string }).trainer_id ?? null)
      setClientName((client as typeof client & { full_name: string }).full_name ?? '')

      const today = new Date().toISOString().split('T')[0]

      let activeLogId: string | null = null
      let activeLogCreatedAt: string | null = null

      if (!freshStart) {
        const { data: existingWorkoutLog } = await supabase
          .from('workout_logs')
          .select('id, created_at')
          .eq('client_id', client.id)
          .eq('day_id', id)
          .is('completed_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        activeLogId = existingWorkoutLog?.id ?? null
        activeLogCreatedAt = existingWorkoutLog?.created_at ?? null
      }

      if (!activeLogId) {
        const { data: newLog } = await supabase
          .from('workout_logs')
          .insert({ client_id: client.id, day_id: id, date: today })
          .select('id, created_at')
          .single()
        activeLogId = newLog?.id ?? null
        activeLogCreatedAt = newLog?.created_at ?? null
      }
      if (activeLogId) setWorkoutLogId(activeLogId)
      if (activeLogCreatedAt) {
        startedAtRef.current = new Date(activeLogCreatedAt).getTime()
      }

      let previousLogs: ExerciseLog[] = []
      if (activeLogId && !freshStart) {
        const { data } = await supabase
          .from('exercise_logs')
          .select('*')
          .eq('workout_log_id', activeLogId)
        previousLogs = data ?? []
      }

      const existingByExercise: Record<string, Record<number, ExerciseLog>> = {}
      const logsByExercise: Record<string, ExerciseLog[]> = {}

      previousLogs.forEach((log, index) => {
        const setNumber = log.sets_done ?? index + 1
        existingByExercise[log.exercise_id] = { ...existingByExercise[log.exercise_id], [setNumber]: log }
        logsByExercise[log.exercise_id] = [...(logsByExercise[log.exercise_id] ?? []), log]
      })

      const initialLogs: Record<string, SetLog[]> = {}
      exerciseList.forEach(exercise => {
        const previous = logsByExercise[exercise.id] ?? []
        const setCount = Math.max(1, exercise.sets)

        initialLogs[exercise.id] = Array.from({ length: setCount }, (_, index) => {
          const setNumber = index + 1
          const previousSet = previous.find(log => log.sets_done === setNumber) ?? previous[index]
          return {
            weight: previousSet?.actual_weight?.toString() ?? exercise.target_weight?.toString() ?? '',
            reps: previousSet?.actual_reps ?? exercise.reps,
            completed: previousSet?.completed ?? false,
          }
        })
      })

      setExistingLogs(existingByExercise)
      setLogs(initialLogs)
      setLoading(false)
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

  const saveWorkout = async () => {
    if (!clientId || !workoutLogId) return

    setSaving(true)
    setError('')

    const completedAt = new Date()
    const durationSeconds = startedAtRef.current > 0
      ? Math.floor((completedAt.getTime() - startedAtRef.current) / 1000)
      : elapsed

    const { error: updateError } = await supabase
      .from('workout_logs')
      .update({ completed_at: completedAt.toISOString(), duration_seconds: durationSeconds })
      .eq('id', workoutLogId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    await supabase
      .from('workout_logs')
      .delete()
      .eq('client_id', clientId)
      .eq('day_id', id)
      .is('completed_at', null)
      .neq('id', workoutLogId)

    for (const exercise of exercises) {
      const exerciseSets = logs[exercise.id] ?? []
      for (let index = 0; index < exerciseSets.length; index++) {
        const set = exerciseSets[index]
        const setNumber = index + 1
        const payload = {
          workout_log_id: workoutLogId,
          exercise_id: exercise.id,
          actual_weight: set.weight ? parseFloat(set.weight) : null,
          actual_reps: set.reps || null,
          sets_done: setNumber,
          completed: set.completed,
        }
        const existing = existingLogs[exercise.id]?.[setNumber]
        if (existing) {
          await supabase.from('exercise_logs').update(payload).eq('id', existing.id)
        } else {
          await supabase.from('exercise_logs').insert(payload)
        }
      }
    }

    setFinalDurationSeconds(durationSeconds)
    setSaving(false)
    setComplete(true)
    showToast('Workout gespeichert ✓', 'success')

    if (clientTrainerId) {
      const dayName = workout?.name ?? 'ein Training'
      await supabase.from('notifications').insert({
        client_id: clientTrainerId,
        type: 'workout',
        title: `${clientName || 'Ein Kunde'} hat ${dayName} abgeschlossen`,
        body: durationSeconds > 0
          ? `Dauer: ${Math.floor(durationSeconds / 60)} Minuten`
          : null,
        is_read: false,
      })
    }
  }

  const handleSwapRequest = async () => {
    if (!clientId || !exercise || !swapReason.trim()) return
    setSwapSending(true)
    setError('')

    const { error: requestError } = await supabase.from('exercise_change_requests').insert({
      client_id: clientId,
      workout_day_id: id,
      exercise_id: exercise.id,
      reason: swapReason.trim(),
      status: 'pending',
    })

    if (requestError) {
      setError(requestError.message)
      setSwapSending(false)
      return
    }

    setSwapSending(false)
    setSwapModalOpen(false)
    setSwapReason('')
    setSwapSent(exercise.id)
    showToast('Anfrage gesendet ✓', 'info')
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
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-gray-700 font-semibold mb-2">Keine Übungen gefunden</p>
        <Link href="/client/plan" className="text-emerald-600 text-sm">Zurück zum Plan</Link>
      </div>
    )
  }

  // ── Complete screen ──────────────────────────────────────────────────────

  if (complete) {
    const completedSets = Object.values(logs).flat().filter(s => s.completed).length
    const totalSets = Object.values(logs).flat().length

    return (
      <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <p className="text-emerald-200 text-xs font-bold uppercase tracking-widest mb-2">Geschafft!</p>
        <h1 className="text-3xl font-bold text-center mb-1">Training abgeschlossen</h1>
        <p className="text-emerald-200 text-sm mb-10">{workout?.name}</p>

        <div className="w-full max-w-sm bg-white/15 rounded-3xl p-6 grid grid-cols-2 gap-5 mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">{formatTime(finalDurationSeconds)}</div>
            <div className="text-emerald-200 text-sm mt-1">Dauer</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{exercises.length}</div>
            <div className="text-emerald-200 text-sm mt-1">Übungen</div>
          </div>
          <div className="text-center col-span-2">
            <div className="text-3xl font-bold">{completedSets}<span className="text-lg font-normal text-emerald-200"> / {totalSets} Sätze</span></div>
            <div className="text-emerald-200 text-sm mt-1">Erledigte Sätze</div>
          </div>
        </div>

        <div className="w-full max-w-sm mt-6">
          <Link
            href="/client"
            className="w-full py-4 bg-white text-emerald-700 font-bold rounded-2xl text-center block hover:bg-emerald-50 transition-colors"
          >
            Zurück zum Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // ── Active player ────────────────────────────────────────────────────────

  return (
    <div className="bg-gray-50 min-h-screen">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-2 max-w-lg mx-auto">
          <Link href="/client/plan" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="text-center">
            <p className="text-xs text-gray-400 font-medium">{workout?.name}</p>
            <p className="text-sm text-gray-900 font-semibold">
              Übung {currentExerciseIndex + 1} von {exercises.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Zeit</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatTime(elapsed)}</p>
          </div>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-lg mx-auto">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
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
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 scale-105'
                        : allDone
                          ? 'border-emerald-300 opacity-70'
                          : 'border-gray-200 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {ex.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ex.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-[9px] font-bold uppercase px-1 text-center leading-tight">
                        {ex.name.slice(0, 8)}
                      </div>
                    )}
                    {allDone && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{exercise.name}</h1>
          <p className="text-emerald-600 text-sm font-medium">
            {exercise.sets} Sätze × {exercise.reps}
            {exercise.target_weight ? ` · ${exercise.target_weight} kg` : ''}
          </p>
          {exercise.note && (
            <p className="text-gray-500 text-sm mt-2">💡 {exercise.note}</p>
          )}
          {swapSent === exercise.id ? (
            <p className="mt-3 text-xs text-gray-400">✓ Anfrage gesendet — dein Trainer wird sie prüfen.</p>
          ) : (
            <button
              type="button"
              onClick={() => { setSwapReason(''); setError(''); setSwapModalOpen(true) }}
              className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
            >
              Übung tauschen anfragen
            </button>
          )}
        </div>

        {/* Sets table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          {/* Column headers */}
          <div className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 px-3 pt-3 pb-2">
            {/* # with settings icon */}
            <div className="flex flex-col items-center gap-0.5">
              <svg className="w-3 h-3 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] font-semibold text-gray-400">#</span>
            </div>
            {/* KG with pencil — tap to bulk-edit */}
            <button
              type="button"
              onClick={() => { setBulkKgOpen(v => !v); setBulkKgValue(exerciseSets[0]?.weight ?? '') }}
              className="flex items-center justify-center gap-1 group"
            >
              <span className="text-[10px] font-semibold text-gray-400 group-hover:text-emerald-600 transition-colors">KG</span>
              <svg className="w-3 h-3 text-gray-300 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <span className="text-[10px] font-semibold text-gray-400 text-center">WDH</span>
            {/* 10RM read-only */}
            <div className="flex items-center justify-center gap-0.5">
              <span className="text-[10px] font-semibold text-gray-400">10RM</span>
              <svg className="w-3 h-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center font-semibold text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={applyBulkKg}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Alle setzen
              </button>
            </div>
          )}

          <div className="mx-3 border-t border-gray-100" />

          {/* Set rows */}
          <div className="py-2 space-y-1">
            {exerciseSets.map((set, setIndex) => {
              const isActive = setIndex === activeSetIndex
              const orm = calc1RM(set.weight, set.reps)

              if (isActive) {
                return (
                  <div
                    key={setIndex}
                    className="grid grid-cols-[2.25rem_1fr_3.25rem_3.5rem_2.75rem] items-center gap-1.5 mx-3 bg-blue-50 rounded-2xl px-2 py-2"
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{setIndex + 1}</span>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0"
                      value={set.weight}
                      onChange={e => updateSet(exercise.id, setIndex, 'weight', e.target.value)}
                      placeholder="—"
                      className="w-full px-2 py-2 bg-white rounded-xl text-sm text-center font-bold text-gray-900 tabular-nums shadow-sm border-0 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    />
                    <span className="text-sm font-bold text-gray-900 text-center tabular-nums">{set.reps}</span>
                    <span className="text-xs font-medium text-blue-500 text-center tabular-nums">{orm}</span>
                    <button
                      type="button"
                      aria-label={`Satz ${setIndex + 1} abhaken`}
                      onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                      className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition-colors shadow-sm mx-auto"
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
                    <span className="text-sm font-semibold text-emerald-500 text-center tabular-nums">{setIndex + 1}</span>
                    <span className="text-sm text-gray-400 text-center tabular-nums">{set.weight || '—'}</span>
                    <span className="text-sm text-gray-400 text-center tabular-nums">{set.reps}</span>
                    <span className="text-xs text-gray-400 text-center tabular-nums">{orm}</span>
                    <button
                      type="button"
                      aria-label={`Satz ${setIndex + 1} rückgängig`}
                      onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                      className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 transition-colors mx-auto"
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
                  <span className="text-sm text-gray-400 text-center tabular-nums">{setIndex + 1}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    value={set.weight}
                    onChange={e => updateSet(exercise.id, setIndex, 'weight', e.target.value)}
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
            })}
          </div>

          <div className="pb-3 text-center text-xs text-gray-400">
            {completedCount === exerciseSets.length
              ? (currentExerciseIndex >= exercises.length - 1
                  ? (saving ? 'Wird gespeichert…' : 'Workout wird abgeschlossen…')
                  : 'Nächste Übung…')
              : `${completedCount} / ${exerciseSets.length} Sätze erledigt`}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

      </main>

      {/* Swap request modal */}
      {swapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">{exercise.name}</p>
              <h2 className="font-semibold text-gray-900">Übung tauschen anfragen</h2>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Warum möchtest du diese Übung tauschen?
              </label>
              <textarea
                value={swapReason}
                onChange={e => setSwapReason(e.target.value)}
                placeholder="z.B. Schmerzen im Schultergelenk, kein passendes Gerät…"
                rows={4}
                autoFocus
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none transition"
              />
              {error && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => setSwapModalOpen(false)}
                className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSwapRequest}
                disabled={!swapReason.trim() || swapSending}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
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
