'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Exercise, ExerciseLog, WorkoutDay } from '@/lib/types'

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

export default function WorkoutPlayerPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const freshStart = searchParams.get('fresh') === '1'

  const [workout, setWorkout] = useState<WorkoutDay | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithImage[]>([])
  const [logs, setLogs] = useState<Record<string, SetLog[]>>({})
  const [existingLogs, setExistingLogs] = useState<Record<string, Record<number, ExerciseLog>>>({})
  const [clientId, setClientId] = useState<string | null>(null)
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null)
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  // Timer
  const [elapsed, setElapsed] = useState(0)
  const [finalDurationSeconds, setFinalDurationSeconds] = useState(0)
  const startedAtRef = useRef<number>(0)

  // Swap request modal
  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [swapReason, setSwapReason] = useState('')
  const [swapSending, setSwapSending] = useState(false)
  const [swapSent, setSwapSent] = useState<string | null>(null) // exercise id that was requested

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
        supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle(),
      ])

      if (!workoutRes.data) { router.push('/client/plan'); return }

      const exerciseList = (exercisesRes.data ?? []) as ExerciseWithImage[]
      setWorkout(workoutRes.data)
      setExercises(exerciseList)

      const client = clientRes.data
      if (!client) { setLoading(false); return }
      setClientId(client.id)

      const today = new Date().toISOString().split('T')[0]

      // Fresh start: always create a new log, ignore any open log
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

      // Fresh start: skip loading old exercise_logs
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
  }, [id, router])

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
  }

  // Auto-advance when all sets of the current exercise are completed.
  // On the last exercise, finish the workout automatically.
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

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── No exercises ───────────────────────────────────────────────────────────

  const exercise = exercises[currentExerciseIndex]
  const exerciseSets = exercise ? logs[exercise.id] ?? [] : []
  const completedCount = exerciseSets.filter(s => s.completed).length
  const progress = exercises.length > 0 ? ((currentExerciseIndex) / exercises.length) * 100 : 0

  if (!exercise && !complete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-6 text-center">
        <div>
          <p className="text-white text-lg font-semibold mb-2">Keine Übungen gefunden</p>
          <Link href="/client/plan" className="text-emerald-400 text-sm">Zurück zum Plan</Link>
        </div>
      </div>
    )
  }

  // ── Complete screen ────────────────────────────────────────────────────────

  if (complete) {
    const completedSets = Object.values(logs).flat().filter(s => s.completed).length
    const totalSets = Object.values(logs).flat().length

    return (
      <div className="min-h-screen bg-gray-950 flex flex-col px-5 pt-16 pb-10">

        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-10">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-[0.2em] mb-3">Geschafft!</p>
          <h1 className="text-3xl font-bold text-white leading-tight mb-2">Training abgeschlossen</h1>
          <p className="text-gray-500 text-sm">{workout?.name}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-900 rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-white tabular-nums mb-1">{formatTime(finalDurationSeconds)}</p>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Dauer</p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-5 text-center">
            <p className="text-3xl font-bold text-white mb-1">{exercises.length}</p>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Übungen</p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl p-5 mb-10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Erledigte Sätze</p>
            <p className="text-xs text-gray-600">{completedSets} / {totalSets}</p>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: totalSets > 0 ? `${(completedSets / totalSets) * 100}%` : '0%' }}
            />
          </div>
          <p className="text-2xl font-bold text-white mt-3 tabular-nums">
            {completedSets}
            <span className="text-base font-normal text-gray-600 ml-1">Sätze</span>
          </p>
        </div>

        {/* CTA */}
        <div className="mt-auto">
          <Link
            href="/client"
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl text-center block transition-colors text-base"
          >
            Zurück zum Dashboard
          </Link>
        </div>

      </div>
    )
  }

  // ── Active player ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/client/plan" className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="text-center">
            <p className="text-xs text-gray-500 font-medium">{workout?.name}</p>
            <p className="text-sm text-white font-semibold">
              Übung {currentExerciseIndex + 1} von {exercises.length}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-gray-500">Zeit</p>
            <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatTime(elapsed)}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Exercise */}
      <main className="flex-1 px-5 pb-24 overflow-y-auto">

        {/* Übungs-Thumbnails (horizontal scrollbar) */}
        {exercises.length > 1 && (
          <div className="-mx-5 px-5 pt-4 pb-1 overflow-x-auto">
            <div className="flex gap-2.5 min-w-max">
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
                    className={`relative flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden border-2 transition-all ${
                      isActive
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30 scale-105'
                        : allDone
                          ? 'border-emerald-700/60 opacity-70'
                          : 'border-gray-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {ex.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ex.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500 text-[10px] font-bold uppercase px-1 text-center leading-tight">
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

        {/* Exercise name + vorgabe */}
        <div className="mb-8 mt-4">
          <h1 className="text-4xl font-bold text-white leading-tight mb-2">
            {exercise.name}
          </h1>
          <p className="text-emerald-400 text-sm font-medium">
            {exercise.sets} Sätze × {exercise.reps}
            {exercise.target_weight ? ` · ${exercise.target_weight} kg` : ''}
          </p>
          {exercise.note && (
            <p className="text-gray-500 text-sm mt-2">💡 {exercise.note}</p>
          )}

          {/* Swap request button */}
          {swapSent === exercise.id ? (
            <p className="mt-3 text-xs text-gray-500">✓ Anfrage gesendet — dein Trainer wird sie prüfen.</p>
          ) : (
            <button
              type="button"
              onClick={() => { setSwapReason(''); setError(''); setSwapModalOpen(true) }}
              className="mt-3 text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
            >
              Übung tauschen anfragen
            </button>
          )}

          {exercise.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={exercise.image_url}
              alt=""
              className="mt-5 w-full aspect-video object-cover rounded-2xl bg-gray-900"
            />
          )}
        </div>

        {/* Sets — compact table */}
        <div className="bg-gray-900 rounded-2xl overflow-hidden">
          {/* Column header */}
          <div className="grid grid-cols-[2.5rem_1fr_4.5rem_3.25rem] items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500 border-b border-gray-800">
            <span className="text-center">Satz</span>
            <span className="text-center">Gewicht (kg)</span>
            <span className="text-center">Wdh</span>
            <span className="text-center">✓</span>
          </div>

          {exerciseSets.map((set, setIndex) => (
            <div
              key={setIndex}
              className={`grid grid-cols-[2.5rem_1fr_4.5rem_3.25rem] items-center gap-2 px-3 py-2 border-b border-gray-800 last:border-b-0 transition-colors ${
                set.completed ? 'bg-emerald-950/40' : ''
              }`}
            >
              <span className={`text-center text-sm font-bold tabular-nums ${
                set.completed ? 'text-emerald-400' : 'text-gray-400'
              }`}>
                {setIndex + 1}
              </span>

              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={set.weight}
                onChange={event => updateSet(exercise.id, setIndex, 'weight', event.target.value)}
                placeholder="—"
                className="w-full px-2 py-3 bg-gray-800 border border-gray-700 rounded-lg text-base text-center font-semibold text-white tabular-nums placeholder:text-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />

              <span className="text-center text-sm font-medium text-gray-300 tabular-nums">
                {set.reps}
              </span>

              <button
                type="button"
                aria-label={`Satz ${setIndex + 1} abhaken`}
                onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                className={`mx-auto w-11 h-11 rounded-lg flex items-center justify-center transition-all ${
                  set.completed
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-800 border border-gray-700 text-gray-500 hover:border-emerald-500 hover:text-emerald-400'
                }`}
              >
                <CheckIcon />
              </button>
            </div>
          ))}
        </div>

        {/* Progress hint */}
        <p className="mt-4 text-center text-xs text-gray-500">
          {completedCount === exerciseSets.length
            ? (currentExerciseIndex >= exercises.length - 1
                ? (saving ? 'Wird gespeichert…' : 'Workout wird abgeschlossen…')
                : 'Nächste Übung…')
            : `${completedCount} / ${exerciseSets.length} Sätze erledigt`}
        </p>

        {error && (
          <div className="mt-4 bg-red-950 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </main>

      {/* Swap request modal */}
      {swapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm bg-gray-900 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <p className="text-xs text-gray-500 mb-0.5">{exercise.name}</p>
              <h2 className="font-semibold text-white">Übung tauschen anfragen</h2>
            </div>

            <div className="px-5 py-4">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Warum möchtest du diese Übung tauschen?
              </label>
              <textarea
                value={swapReason}
                onChange={e => setSwapReason(e.target.value)}
                placeholder="z.B. Schmerzen im Schultergelenk, kein passendes Gerät…"
                rows={4}
                autoFocus
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none transition"
              />
              {error && (
                <div className="mt-3 bg-red-950 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button
                type="button"
                onClick={() => setSwapModalOpen(false)}
                className="flex-1 py-3 border border-gray-700 text-gray-400 font-medium rounded-xl hover:bg-gray-800 transition-colors text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSwapRequest}
                disabled={!swapReason.trim() || swapSending}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
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
