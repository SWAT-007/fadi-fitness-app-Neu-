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

  const [elapsed, setElapsed] = useState(0)
  const [finalDurationSeconds, setFinalDurationSeconds] = useState(0)
  const startedAtRef = useRef<number>(0)

  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [swapReason, setSwapReason] = useState('')
  const [swapSending, setSwapSending] = useState(false)
  const [swapSent, setSwapSent] = useState<string | null>(null)

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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Column header */}
          <div className="grid grid-cols-[2.5rem_1fr_4.5rem_3.25rem] items-center gap-2 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100">
            <span className="text-center">Satz</span>
            <span className="text-center">Gewicht (kg)</span>
            <span className="text-center">Wdh</span>
            <span className="text-center">✓</span>
          </div>

          {exerciseSets.map((set, setIndex) => (
            <div
              key={setIndex}
              className={`grid grid-cols-[2.5rem_1fr_4.5rem_3.25rem] items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 transition-colors ${
                set.completed ? 'bg-emerald-50' : ''
              }`}
            >
              <span className={`text-center text-sm font-bold tabular-nums ${
                set.completed ? 'text-emerald-600' : 'text-gray-400'
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
                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-base text-center font-semibold text-gray-900 tabular-nums placeholder:text-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />

              <span className="text-center text-sm font-medium text-gray-600 tabular-nums">
                {set.reps}
              </span>

              <button
                type="button"
                aria-label={`Satz ${setIndex + 1} abhaken`}
                onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                className={`mx-auto w-11 h-11 rounded-lg flex items-center justify-center transition-all ${
                  set.completed
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-300 hover:border-emerald-400 hover:text-emerald-500'
                }`}
              >
                <CheckIcon />
              </button>
            </div>
          ))}
        </div>

        {/* Progress hint */}
        <p className="text-center text-xs text-gray-400">
          {completedCount === exerciseSets.length
            ? (currentExerciseIndex >= exercises.length - 1
                ? (saving ? 'Wird gespeichert…' : 'Workout wird abgeschlossen…')
                : 'Nächste Übung…')
            : `${completedCount} / ${exerciseSets.length} Sätze erledigt`}
        </p>

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
