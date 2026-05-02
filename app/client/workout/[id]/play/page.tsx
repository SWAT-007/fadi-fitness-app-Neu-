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

type ExerciseWithImage = Exercise & {
  image_url?: string | null
}

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

  // Confirm finish modal (when not all sets completed)
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false)
  const [pendingFinish, setPendingFinish] = useState(false)

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
    setLogs(prev => {
      const next = {
        ...prev,
        [exerciseId]: prev[exerciseId].map((set, index) => (
          index === setIndex ? { ...set, [field]: value } : set
        )),
      }
      // Auto-finish when all sets become completed and user was pending
      if (pendingFinish && Object.values(next).flat().every(s => s.completed)) {
        setTimeout(() => saveWorkout(), 0)
      }
      return next
    })
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

  const handleNext = async () => {
    const isLastExercise = currentExerciseIndex >= exercises.length - 1
    if (isLastExercise) {
      const allDone = Object.values(logs).flat().every(s => s.completed)
      if (!allDone) {
        setConfirmFinishOpen(true)
        return
      }
      await saveWorkout()
      return
    }
    setCurrentExerciseIndex(index => index + 1)
  }

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
  const isLastExercise = currentExerciseIndex >= exercises.length - 1
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
      <main className="flex-1 px-5 pb-36 overflow-y-auto">

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

        {/* Sets */}
        <div className="space-y-3">
          {exerciseSets.map((set, setIndex) => (
            <div
              key={setIndex}
              className={`bg-gray-900 rounded-2xl px-4 py-4 transition-colors ${
                set.completed ? 'bg-emerald-950/50 ring-1 ring-emerald-800' : ''
              }`}
            >
              {/* Set label */}
              <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${
                set.completed ? 'text-emerald-400' : 'text-gray-500'
              }`}>
                Satz {setIndex + 1}
              </p>

              {/* Inputs row on desktop, stacked on mobile */}
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={set.weight}
                  onChange={event => updateSet(exercise.id, setIndex, 'weight', event.target.value)}
                  placeholder="Gewicht (kg)"
                  className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-xl text-base text-center font-medium text-white placeholder:text-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />

                <input
                  value={set.reps}
                  onChange={event => updateSet(exercise.id, setIndex, 'reps', event.target.value)}
                  placeholder="Wiederholungen"
                  className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-xl text-base text-center font-medium text-white placeholder:text-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                />

                {/* Check button */}
                <button
                  type="button"
                  aria-label={`Satz ${setIndex + 1} abhaken`}
                  onClick={() => updateSet(exercise.id, setIndex, 'completed', !set.completed)}
                  className={`w-full md:w-14 h-14 rounded-xl border-2 flex items-center justify-center gap-2 font-semibold text-sm transition-all ${
                    set.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-700 text-gray-600 hover:border-emerald-500 hover:text-emerald-500'
                  }`}
                >
                  <CheckIcon />
                  <span className="md:hidden">{set.completed ? 'Erledigt' : 'Abhaken'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 bg-red-950 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </main>

      {/* Bottom CTA — sits above the client bottom nav */}
      <div className="fixed bottom-16 left-0 right-0 px-5 pb-4 pt-3 bg-gray-950/95 backdrop-blur">
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors text-base"
        >
          {isLastExercise
            ? (saving ? 'Wird gespeichert…' : 'Workout abschließen')
            : 'Nächste Übung →'}
        </button>
      </div>

      {/* Incomplete sets modal */}
      {confirmFinishOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-sm bg-gray-900 rounded-2xl overflow-hidden">
            <div className="px-5 py-5">
              <p className="text-2xl mb-3">☑️</p>
              <h2 className="font-bold text-white text-lg mb-2">Sätze nicht vollständig</h2>
              <p className="text-gray-400 text-sm">Bitte erledige zuerst alle Sätze.</p>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => {
                  const firstIncompleteIndex = exercises.findIndex(ex =>
                    logs[ex.id]?.some(set => !set.completed)
                  )
                  if (firstIncompleteIndex !== -1) {
                    setCurrentExerciseIndex(firstIncompleteIndex)
                  }
                  setPendingFinish(true)
                  setConfirmFinishOpen(false)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                Zur offenen Übung
              </button>
            </div>
          </div>
        </div>
      )}

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
