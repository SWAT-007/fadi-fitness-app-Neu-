'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ExercisePicker from '@/components/ExercisePicker'
import { supabase } from '@/lib/supabase'
import type { LibraryExercise } from '@/lib/exercises'

// ─── Local types ────────────────────────────────────────────────────────────

type Step = 'type' | 'method' | 'details' | 'duration' | 'builder'

interface DayExercise {
  libraryId: string
  name: string
  sets: number
  reps: string
  rest_seconds: number
  image_url?: string | null
}

interface DayConfig {
  name: string
  exercises: DayExercise[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_DAY_NAMES = ['Push', 'Pull', 'Beine', 'Oberkörper', 'Ganzkörper', 'Kraft', 'Cardio']

function BackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function ProgressHeader({ onBack, progress }: { onBack: () => void; progress: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <button onClick={onBack} className="text-gray-400 hover:text-gray-600 p-1 -ml-1">
        <BackIcon />
      </button>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// Fixed bottom button accounts for desktop sidebar (w-64)
function BottomCTA({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="fixed bottom-0 left-0 lg:left-64 right-0 p-4 bg-white border-t border-gray-100 z-10">
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors text-sm"
      >
        {label}
      </button>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function NewPlanPage() {
  const router = useRouter()

  // Wizard state
  const [step, setStep] = useState<Step>('type')
  const [planName, setPlanName] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [durationWeeks, setDurationWeeks] = useState(8)
  const [days, setDays] = useState<DayConfig[]>([])
  const [activeDay, setActiveDay] = useState(0)

  // Exercise picker state
  const [pickerOpen, setPickerOpen] = useState(false)

  // Save state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Enter builder — only reinitialise days if count changed
  const enterBuilder = () => {
    if (days.length !== daysPerWeek) {
      setDays(
        Array.from({ length: daysPerWeek }, (_, i) => ({
          name: DEFAULT_DAY_NAMES[i] ?? `Tag ${i + 1}`,
          exercises: [],
        }))
      )
      setActiveDay(0)
    }
    setStep('builder')
  }

  // Day helpers
  const updateDayName = (i: number, name: string) =>
    setDays(prev => prev.map((d, idx) => idx === i ? { ...d, name } : d))

  const addExercise = (ex: LibraryExercise) => {
    setDays(prev => prev.map((d, i) =>
      i !== activeDay ? d : {
        ...d,
        exercises: [...d.exercises, { libraryId: ex.id, name: ex.name, sets: 3, reps: '10', rest_seconds: 60, image_url: ex.image_url ?? null }],
      }
    ))
    setPickerOpen(false)
  }

  const updateExercise = (dayIdx: number, exIdx: number, patch: Partial<DayExercise>) =>
    setDays(prev => prev.map((d, i) =>
      i !== dayIdx ? d : { ...d, exercises: d.exercises.map((e, j) => j !== exIdx ? e : { ...e, ...patch }) }
    ))

  const removeExercise = (dayIdx: number, exIdx: number) =>
    setDays(prev => prev.map((d, i) =>
      i !== dayIdx ? d : { ...d, exercises: d.exercises.filter((_, j) => j !== exIdx) }
    ))

  // Save everything to Supabase
  const handleSave = async () => {
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    const { data: plan, error: planErr } = await supabase
      .from('workout_plans')
      .insert({
        trainer_id: user.id,
        name: planName.trim(),
        training_days_per_week: daysPerWeek,
        duration_weeks: durationWeeks,
      })
      .select()
      .single()

    if (planErr || !plan) {
      setError(planErr?.message ?? 'Plan konnte nicht gespeichert werden.')
      setSaving(false)
      return
    }

    for (let i = 0; i < days.length; i++) {
      const day = days[i]
      const { data: wDay } = await supabase
        .from('workout_days')
        .insert({ plan_id: plan.id, name: day.name, sort_order: i })
        .select()
        .single()

      if (wDay && day.exercises.length > 0) {
        await supabase.from('exercises').insert(
          day.exercises.map((ex, j) => ({
            day_id: wDay.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            sort_order: j,
            library_id: ex.libraryId || null,
            image_url: ex.image_url ?? null,
          }))
        )
      }
    }

    router.push(`/admin/plans/${plan.id}`)
  }

  // ── Step 1: Type ───────────────────────────────────────────────────────────
  if (step === 'type') return (
    <div>
      <ProgressHeader onBack={() => router.back()} progress={20} />
      <div className="px-6 pt-2 pb-32">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Was möchtest du erstellen?</h1>
        <p className="text-gray-500 text-sm mb-8">Wähle den Typ deines neuen Trainingsformats.</p>
        <div className="space-y-3">
          <button
            onClick={() => setStep('method')}
            className="w-full bg-white border-2 border-indigo-500 rounded-2xl p-5 text-left hover:bg-indigo-50 transition-colors"
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold text-gray-900">Plan</div>
            <div className="text-sm text-gray-500 mt-1">Mehrere Trainingstage strukturiert kombinieren</div>
          </button>
          <button
            disabled
            className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 text-left opacity-40 cursor-not-allowed"
          >
            <div className="text-2xl mb-2">⚡️</div>
            <div className="font-semibold text-gray-900">Workout</div>
            <div className="text-sm text-gray-500 mt-1">Einzelne Einheit — demnächst verfügbar</div>
          </button>
        </div>
      </div>
    </div>
  )

  // ── Step 2: Method ─────────────────────────────────────────────────────────
  if (step === 'method') return (
    <div>
      <ProgressHeader onBack={() => setStep('type')} progress={40} />
      <div className="px-6 pt-2 pb-32">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Wie willst du starten?</h1>
        <p className="text-gray-500 text-sm mb-8">Starte leer oder lass dir helfen.</p>
        <div className="space-y-3">
          <button
            onClick={() => setStep('details')}
            className="w-full bg-white border-2 border-indigo-500 rounded-2xl p-5 text-left hover:bg-indigo-50 transition-colors"
          >
            <div className="text-2xl mb-2">✏️</div>
            <div className="font-semibold text-gray-900">Leerer Plan</div>
            <div className="text-sm text-gray-500 mt-1">Selbst alles von Grund auf aufbauen</div>
          </button>
          <button
            disabled
            className="w-full bg-white border-2 border-gray-200 rounded-2xl p-5 text-left opacity-40 cursor-not-allowed"
          >
            <div className="text-2xl mb-2">🤖</div>
            <div className="font-semibold text-gray-900">Plangenerator</div>
            <div className="text-sm text-gray-500 mt-1">KI erstellt einen Plan für dich — demnächst</div>
          </button>
        </div>
      </div>
    </div>
  )

  // ── Step 3: Details (name + frequency) ────────────────────────────────────
  if (step === 'details') return (
    <div>
      <ProgressHeader onBack={() => setStep('method')} progress={60} />
      <div className="px-6 pt-2 pb-32">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Plan benennen</h1>
        <p className="text-gray-500 text-sm mb-8">Wie heißt der Plan und wie oft wird trainiert?</p>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Planname</label>
            <input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="z.B. Push / Pull / Beine"
              autoFocus
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Wie oft pro Woche?</label>
            <div className="grid grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <button
                  key={n}
                  onClick={() => setDaysPerWeek(n)}
                  className={`py-3 rounded-xl text-sm font-bold transition-colors ${
                    daysPerWeek === n
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
                  }`}
                >
                  {n}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <BottomCTA label="Weiter" onClick={() => setStep('duration')} disabled={!planName.trim()} />
    </div>
  )

  // ── Step 4: Duration ───────────────────────────────────────────────────────
  if (step === 'duration') return (
    <div>
      <ProgressHeader onBack={() => setStep('details')} progress={80} />
      <div className="px-6 pt-2 pb-32">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Plandauer</h1>
        <p className="text-gray-500 text-sm mb-8">Wie viele Wochen läuft der Plan?</p>
        <div className="grid grid-cols-2 gap-3">
          {[4, 8, 12, 16].map(w => (
            <button
              key={w}
              onClick={() => setDurationWeeks(w)}
              className={`py-8 rounded-2xl text-center border-2 transition-colors ${
                durationWeeks === w
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-indigo-200'
              }`}
            >
              <div className={`text-3xl font-bold ${durationWeeks === w ? 'text-indigo-600' : 'text-gray-900'}`}>
                {w}
              </div>
              <div className={`text-sm mt-1 ${durationWeeks === w ? 'text-indigo-500' : 'text-gray-500'}`}>
                Wochen
              </div>
            </button>
          ))}
        </div>
      </div>
      <BottomCTA label="Weiter zum Plan Builder" onClick={enterBuilder} />
    </div>
  )

  // ── Step 5: Builder ────────────────────────────────────────────────────────
  const currentDay = days[activeDay]
  if (!currentDay) return null

  return (
    <div>
      {/* Sticky header: plan summary + day tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button onClick={() => setStep('duration')} className="text-gray-400 hover:text-gray-600 p-1 -ml-1">
            <BackIcon />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm truncate">{planName}</div>
            <div className="text-xs text-gray-400">{daysPerWeek}× pro Woche · {durationWeeks} Wochen</div>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {days.map((d, i) => (
            <button
              key={i}
              onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeDay === i
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d.name || `Tag ${i + 1}`}
            </button>
          ))}
        </div>
      </div>

      {/* Day content */}
      <div className="p-4 pb-32 space-y-3">

        {/* Day name */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">
            Tagesname
          </label>
          <input
            value={currentDay.name}
            onChange={e => updateDayName(activeDay, e.target.value)}
            placeholder="z.B. Push, Pull, Beine…"
            className="w-full text-xl font-bold text-gray-900 bg-transparent border-none outline-none placeholder:font-normal placeholder:text-gray-300"
          />
        </div>

        {/* Exercise cards */}
        {currentDay.exercises.map((ex, exIdx) => (
          <div key={exIdx} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-900 text-sm">{ex.name}</span>
              <button
                onClick={() => removeExercise(activeDay, exIdx)}
                className="text-gray-300 hover:text-red-400 transition-colors p-1"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: 'Sätze',     field: 'sets'         as const, type: 'number' },
                { label: 'Wdh.',      field: 'reps'         as const, type: 'text'   },
                { label: 'Pause (s)', field: 'rest_seconds' as const, type: 'number' },
              ] as const).map(({ label, field, type }) => (
                <div key={field}>
                  <div className="text-xs text-gray-400 mb-1 text-center">{label}</div>
                  <input
                    type={type}
                    value={ex[field]}
                    min={0}
                    onChange={e => updateExercise(activeDay, exIdx, {
                      [field]: type === 'number' ? Number(e.target.value) : e.target.value,
                    })}
                    className="w-full px-2 py-2 border border-gray-200 rounded-xl text-sm text-center font-medium focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Add exercise */}
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors text-sm font-medium"
        >
          + Übung hinzufügen
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </div>

      {/* Save CTA */}
      <BottomCTA
        label={saving ? 'Plan wird gespeichert…' : 'Plan speichern'}
        onClick={handleSave}
        disabled={saving}
      />

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addExercise}
      />
    </div>
  )
}
