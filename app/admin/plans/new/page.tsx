'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_DAY_NAMES = ['Push', 'Pull', 'Beine', 'Oberkoerper', 'Ganzkoerper', 'Kraft', 'Cardio']
const FREQUENCY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const
const DURATION_OPTIONS = [4, 8, 12, 16] as const

type CreatePlanResponse = {
  plan?: {
    id?: string
  }
  message?: string
}

export default function NewPlanPage() {
  const router = useRouter()
  const [planName, setPlanName] = useState('')
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3)
  const [durationWeeks, setDurationWeeks] = useState<number>(8)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isValid = planName.trim().length > 0

  const handleCreatePlan = async () => {
    if (!isValid || saving) return

    setSaving(true)
    setError('')

    try {
      const response = await fetch('/api/backend/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: planName.trim(),
          description: null,
          days: Array.from({ length: daysPerWeek }, (_, index) => ({
            name: DEFAULT_DAY_NAMES[index] ?? `Tag ${index + 1}`,
            description: null,
            exercises: [],
          })),
        }),
      })

      const payload = (await response.json().catch(() => null)) as CreatePlanResponse | null

      if (!response.ok || !payload?.plan?.id) {
        if (response.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError(payload?.message || 'Plan konnte nicht erstellt werden.')
        }
        setSaving(false)
        return
      }

      router.push(`/admin/plans/${payload.plan.id}`)
    } catch {
      setError('Backend nicht erreichbar.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#797D83]">
            MilaCoach Admin
          </p>
          <div className="space-y-2">
            <h1
              className="text-5xl uppercase leading-none text-[#EDECEA] sm:text-6xl"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Neuen Plan erstellen
            </h1>
            <p className="max-w-2xl text-sm text-[#B9B6B0] sm:text-base">
              Lege die Grunddaten fest und springe danach direkt in den Plan Builder.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="rounded-[28px] border border-white/[0.06] bg-[#111318] p-5 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)] sm:p-6">
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[#EDECEA]" htmlFor="plan-name">
                  Planname
                </label>
                <input
                  id="plan-name"
                  value={planName}
                  onChange={event => setPlanName(event.target.value)}
                  placeholder="z. B. Push / Pull / Beine"
                  autoFocus
                  className="w-full rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3.5 text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:border-[#A78BFA]/50 focus:outline-none"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-[#EDECEA]">Haeufigkeit pro Woche</label>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#A78BFA]">
                    {daysPerWeek}x ausgewaehlt
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {FREQUENCY_OPTIONS.map(option => {
                    const selected = daysPerWeek === option
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDaysPerWeek(option)}
                        className={`rounded-2xl border px-4 py-4 text-sm font-semibold transition-colors ${
                          selected
                            ? 'border-[#A78BFA] bg-[#A78BFA]/14 text-[#EDECEA]'
                            : 'border-white/[0.06] bg-[#111111] text-[#EDECEA] hover:border-white/[0.12] hover:bg-[#171717]'
                        }`}
                      >
                        {option}x
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-[#EDECEA]">Plandauer</label>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#A78BFA]">
                    {durationWeeks} Wochen
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {DURATION_OPTIONS.map(option => {
                    const selected = durationWeeks === option
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDurationWeeks(option)}
                        className={`rounded-2xl border px-4 py-5 text-left transition-colors ${
                          selected
                            ? 'border-[#A78BFA] bg-[#A78BFA]/14 text-[#EDECEA]'
                            : 'border-white/[0.06] bg-[#111111] text-[#EDECEA] hover:border-white/[0.12] hover:bg-[#171717]'
                        }`}
                      >
                        <div className="text-2xl font-semibold leading-none">{option}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#B9B6B0]">
                          Wochen
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleCreatePlan}
                disabled={!isValid || saving}
                className="btn-primary w-full px-5 py-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Plan wird erstellt...' : 'Plan erstellen'}
              </button>
            </div>
          </section>

          <aside className="rounded-[28px] border border-white/[0.06] bg-[#111111] p-5 sm:p-6">
            <div className="flex h-full flex-col gap-6">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#797D83]">
                  Vorschau
                </p>
                <h2
                  className="text-3xl uppercase leading-none text-[#EDECEA]"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Direkt in den Builder
                </h2>
                <p className="text-sm text-[#B9B6B0]">
                  Nach dem Erstellen landest du ohne weitere Zwischenschritte direkt auf der bestehenden Plan-Builder-Seite.
                </p>
              </div>

              <div className="rounded-3xl border border-white/[0.06] bg-[#111318] p-5">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#797D83]">Plan</p>
                    <p className="mt-2 text-lg font-semibold text-[#EDECEA]">
                      {planName.trim() || 'Noch kein Name'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/[0.06] bg-[#111111] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#797D83]">Frequenz</p>
                      <p className="mt-2 text-xl font-semibold text-[#EDECEA]">{daysPerWeek}x</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-[#111111] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#797D83]">Dauer</p>
                      <p className="mt-2 text-xl font-semibold text-[#EDECEA]">{durationWeeks} W</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-dashed border-[#A78BFA]/25 bg-[#A78BFA]/8 p-5 text-sm text-[#D8CCFF]">
                Es werden direkt {daysPerWeek} Trainingstage vorbereitet. Inhalte, Reihenfolge und Uebungen bearbeitest du anschliessend wie gewohnt im bestehenden Builder.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
