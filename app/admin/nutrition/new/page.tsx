'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CALORIE_PRESETS = [1500, 1800, 2000, 2200, 2500, 3000] as const

type BackendCreatedPlan = {
  id: string
  name: string
  description: string | null
  goal: string
  targetCalories: number | null
  targetProtein: number | null
  targetCarbs: number | null
  targetFat: number | null
  createdAt: string
  updatedAt: string
  mealCount: number
  assignmentCount: number
}

export default function NewNutritionPlanPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [calories, setCalories] = useState('2000')
  const [protein, setProtein] = useState('150')
  const [fat, setFat] = useState('40')

  // ── Macro math: carbs are whatever calories remain after protein & fat ──
  const kcal = Number(calories) || 0
  const proteinG = Number(protein)
  const fatG = Number(fat)
  const proteinValid = Number.isFinite(proteinG) && proteinG >= 0
  const fatValid = Number.isFinite(fatG) && fatG >= 0

  const proteinCalories = (proteinValid ? proteinG : 0) * 4
  const fatCalories = (fatValid ? fatG : 0) * 9
  const remainingCalories = kcal - proteinCalories - fatCalories
  const carbGrams = remainingCalories / 4
  const carbsNegative = kcal > 0 && remainingCalories < 0

  const fieldsValid =
    name.trim().length > 0 &&
    kcal > 0 &&
    proteinValid &&
    fatValid

  const isValid = fieldsValid && remainingCalories >= 0

  // Distribution shares for the preview bar.
  const pShare = kcal > 0 ? Math.max(0, proteinCalories / kcal) : 0
  const fShare = kcal > 0 ? Math.max(0, fatCalories / kcal) : 0
  const cShare = kcal > 0 ? Math.max(0, remainingCalories / kcal) : 0

  const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0)

  const handleSubmit = async () => {
    if (!isValid || saving) return
    setError(null)
    setSaving(true)
    try {
      const response = await fetch('/api/backend/nutrition/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: null,
          goal: 'maintain',
          targetCalories: kcal,
          targetProtein: proteinG,
          targetCarbs: carbGrams,
          targetFat: fatG,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        if (response.status === 401) setError('Backend-Login erforderlich.')
        else setError(payload?.message ?? 'Plan konnte nicht erstellt werden.')
        setSaving(false)
        return
      }

      const plan = (payload?.plan ?? null) as BackendCreatedPlan | null
      if (!plan?.id) {
        setError('Ungültige Backend-Antwort.')
        setSaving(false)
        return
      }

      router.push(`/admin/nutrition/${plan.id}`)
    } catch {
      setError('Backend nicht erreichbar.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-[var(--background)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="space-y-3">
          <Link
            href="/admin/nutrition"
            className="inline-flex items-center gap-1.5 text-sm text-[#797D83] hover:text-[#EDECEA] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zurück zu Ernährungsplänen
          </Link>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#797D83]">MilaCoach Admin</p>
            <h1
              className="text-5xl uppercase leading-none text-[#EDECEA] sm:text-6xl"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Neuer Ernährungsplan
            </h1>
            <p className="max-w-2xl text-sm text-[#B9B6B0] sm:text-base">
              Kalorien sowie Eiweiß & Fett in Gramm eingeben — Kohlenhydrate werden automatisch berechnet. Danach direkt in den Ernährungs-Builder.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          {/* Form */}
          <section className="rounded-[28px] border border-white/[0.06] bg-[#111318] p-5 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)] sm:p-6">
            <div className="space-y-8">
              {/* Name */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[#EDECEA]" htmlFor="plan-name">
                  Planname
                </label>
                <input
                  id="plan-name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="z. B. Diät Phase 1, Masseaufbau"
                  autoFocus
                  className="w-full rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3.5 text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:border-[#A78BFA]/50 focus:outline-none"
                />
              </div>

              {/* Calories */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-[#EDECEA]" htmlFor="plan-kcal">Tageskalorien (kcal)</label>
                  <span className="text-xs uppercase tracking-[0.18em] text-[#A78BFA]">{kcal || 0} kcal</span>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {CALORIE_PRESETS.map(preset => {
                    const selected = kcal === preset
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCalories(String(preset))}
                        className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors ${
                          selected
                            ? 'border-[#A78BFA] bg-[#A78BFA]/14 text-[#EDECEA]'
                            : 'border-white/[0.06] bg-[#111111] text-[#EDECEA] hover:border-white/[0.12] hover:bg-[#171717]'
                        }`}
                      >
                        {preset}
                      </button>
                    )
                  })}
                </div>
                <input
                  id="plan-kcal"
                  type="number"
                  min={0}
                  max={8000}
                  value={calories}
                  onChange={event => setCalories(event.target.value)}
                  placeholder="Eigener Wert (kcal)"
                  className="w-full rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3.5 text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:border-[#A78BFA]/50 focus:outline-none"
                />
              </div>

              {/* Macros in grams */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-[#EDECEA]">Makros (in Gramm)</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-[0.14em] text-[#797D83]" htmlFor="protein">Eiweiß (g)</label>
                    <input
                      id="protein"
                      type="number"
                      min={0}
                      max={1000}
                      step={5}
                      value={protein}
                      onChange={event => setProtein(event.target.value)}
                      className="w-full rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3 text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:border-[#A78BFA]/50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-[0.14em] text-[#797D83]" htmlFor="fat">Fett (g)</label>
                    <input
                      id="fat"
                      type="number"
                      min={0}
                      max={1000}
                      step={5}
                      value={fat}
                      onChange={event => setFat(event.target.value)}
                      className="w-full rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3 text-sm text-[#EDECEA] placeholder:text-[#797D83] focus:border-[#A78BFA]/50 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase tracking-[0.14em] text-[#797D83]" htmlFor="carbs">Kohlenhydrate (g) · auto</label>
                    <input
                      id="carbs"
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={carbsNegative ? '—' : `${fmt(carbGrams)}`}
                      className="w-full cursor-default rounded-2xl border border-white/[0.06] bg-[#0c0c10] px-4 py-3 text-sm font-semibold text-[#34D399] focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-[#797D83]">
                  Kohlenhydrate = (Kalorien − Eiweiß×4 − Fett×9) ÷ 4. Wird automatisch aktualisiert.
                </p>
              </div>

              {carbsNegative && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  Eiweiß und Fett überschreiten die Tageskalorien.
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isValid || saving}
                className="btn-primary w-full px-5 py-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Plan wird erstellt...' : 'Plan erstellen & bearbeiten →'}
              </button>
            </div>
          </section>

          {/* Preview */}
          <aside className="rounded-[28px] border border-white/[0.06] bg-[#111111] p-5 sm:p-6">
            <div className="flex h-full flex-col gap-6">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#797D83]">Vorschau</p>
                <h2
                  className="text-3xl uppercase leading-none text-[#EDECEA]"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Makro-Vorlage
                </h2>
                <p className="text-sm text-[#B9B6B0]">
                  Live berechnet. Feinschliff erfolgt im Builder.
                </p>
              </div>

              <div className="rounded-3xl border border-white/[0.06] bg-[#111318] p-5">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#797D83]">Plan</p>
                    <p className="mt-2 text-lg font-semibold text-[#EDECEA]">
                      {name.trim() || 'Noch kein Name'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-[#111111] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#797D83]">Tageskalorien</p>
                    <p className="mt-2 text-2xl font-semibold text-[#EDECEA] tabular-nums">{kcal || 0} <span className="text-sm text-[#797D83]">kcal</span></p>
                  </div>

                  {/* Distribution bar */}
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#797D83]">Makro-Verteilung</p>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#1c1c28]">
                      <div style={{ width: `${pShare * 100}%`, backgroundColor: '#A78BFA' }} />
                      <div style={{ width: `${cShare * 100}%`, backgroundColor: '#34D399' }} />
                      <div style={{ width: `${fShare * 100}%`, backgroundColor: '#FBBF24' }} />
                    </div>
                  </div>

                  {/* Macro rows */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#111111] px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-[#EDECEA]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#A78BFA' }} />
                        Eiweiß
                      </span>
                      <span className="text-sm font-semibold text-[#EDECEA] tabular-nums">{fmt(proteinValid ? proteinG : 0)} g</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#111111] px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-[#EDECEA]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#FBBF24' }} />
                        Fett
                      </span>
                      <span className="text-sm font-semibold text-[#EDECEA] tabular-nums">{fmt(fatValid ? fatG : 0)} g</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-[#111111] px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-[#EDECEA]">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#34D399' }} />
                        Kohlenhydrate
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {carbsNegative
                          ? <span className="text-red-300">—</span>
                          : <span className="text-[#EDECEA]">{fmt(carbGrams)} g</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-dashed border-[#A78BFA]/25 bg-[#A78BFA]/8 p-5 text-sm text-[#D8CCFF]">
                Nach dem Erstellen landest du direkt im Ernährungs-Builder.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
