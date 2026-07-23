'use client'

import { useEffect, useRef, useState } from 'react'
import type { MealLog } from '@/lib/types'
import { EmptyState } from '@/components/ui/client-ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealForm {
  meal_name: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

interface DayGroup {
  dateKey: string   // YYYY-MM-DD, used for sorting
  label: string     // human-readable label shown in UI
  items: MealLog[]
}

// ─── Backend shape ────────────────────────────────────────────────────────────

type BackendMealLog = {
  id: string
  clientId: string
  date: string
  mealType: string | null
  notes: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  createdAt: string
  updatedAt: string
}

function mapMealLog(m: BackendMealLog): MealLog {
  return {
    id: m.id,
    client_id: m.clientId,
    meal_name: m.mealType ?? '',
    calories: m.calories,
    protein_g: m.protein,
    carbs_g: m.carbs,
    fat_g: m.fat,
    logged_at: m.createdAt,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: MealForm = {
  meal_name: '',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
}

/** Returns a YYYY-MM-DD string in the local timezone */
function toLocalDateKey(isoString: string): string {
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey(): string {
  return toLocalDateKey(new Date().toISOString())
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toLocalDateKey(d.toISOString())
}

function humanLabel(dateKey: string): string {
  if (dateKey === todayKey()) return 'Heute'
  if (dateKey === yesterdayKey()) return 'Gestern'
  const [y, m, day] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** Groups logs by local date, newest date first */
function groupByDate(logs: MealLog[]): DayGroup[] {
  const map = new Map<string, MealLog[]>()
  for (const log of logs) {
    const key = toLocalDateKey(log.logged_at)
    const bucket = map.get(key) ?? []
    bucket.push(log)
    map.set(key, bucket)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // descending
    .map(([dateKey, items]) => ({
      dateKey,
      label: humanLabel(dateKey),
      items,
    }))
}

// ─── Macro badge ─────────────────────────────────────────────────────────────

function MacroBadge({ value, unit, color }: { value: number; unit: string; color: string }) {
  return (
    <span className={`text-xs font-medium ${color}`}>
      {value}{unit}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MealsPage() {
  const formRef = useRef<HTMLDivElement>(null)

  const [logs, setLogs] = useState<MealLog[]>([])
  const [form, setForm] = useState<MealForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  // ── Load meals ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/backend/me/nutrition/meal-logs')
      const data = res.ok ? await res.json().catch(() => null) : null
      setLogs(((data?.mealLogs ?? []) as BackendMealLog[]).map(mapMealLog))
      setLoading(false)
    }
    load()
  }, [])

  // ── Save new meal ──────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.meal_name.trim()) return
    setSaving(true)
    setError('')

    try {
      const optionalNumber = (value: string) => value.trim() === '' ? null : Number(value)
      const res = await fetch('/api/backend/me/nutrition/meal-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType: form.meal_name.trim(),
          calories: optionalNumber(form.calories),
          protein: optionalNumber(form.protein_g),
          carbs: optionalNumber(form.carbs_g),
          fat: optionalNumber(form.fat_g),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.message ?? 'Fehler beim Speichern.')
        setSaving(false)
        return
      }
      const data = await res.json().catch(() => null)
      if (data?.mealLog) {
        setLogs(prev => [mapMealLog(data.mealLog as BackendMealLog), ...prev])
        setForm(EMPTY_FORM)
        showFlash('✓ Mahlzeit gespeichert')
      }
    } catch {
      setError('Fehler beim Speichern.')
    }
    setSaving(false)
  }

  // ── Re-add a past meal ─────────────────────────────────────────────────────
  const reAdd = (log: MealLog) => {
    setForm({
      meal_name: log.meal_name,
      calories:  log.calories  != null ? String(log.calories)  : '',
      protein_g: log.protein_g != null ? String(log.protein_g) : '',
      carbs_g:   log.carbs_g   != null ? String(log.carbs_g)   : '',
      fat_g:     log.fat_g     != null ? String(log.fat_g)     : '',
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2500)
  }

  const set = (field: keyof MealForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))

  const grouped = groupByDate(logs)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-lg mx-auto pb-8">
      <h1 className="text-display">Freies Protokoll</h1>
      <p className="text-sm text-[#797D83] mt-1 mb-5">
        Für freie Einträge. Dein Haupt-Ernährungsplan ist unter Ernährung.
      </p>

      {/* ── Log Form ────────────────────────────────────────────────────────── */}
      <div ref={formRef} className="card-secondary p-5 mb-6">
        <h2 className="text-section mb-4">Neuer Eintrag</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-3">
            {error}
          </div>
        )}
        {flash && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl mb-3">
            {flash}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-[#797D83] uppercase tracking-wide mb-1.5">
              Bezeichnung
            </label>
            <input
              value={form.meal_name}
              onChange={set('meal_name')}
              required
              placeholder="z.B. Haferflocken mit Beeren"
              className="w-full px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.1] rounded-xl text-sm text-[#EDECEA] placeholder-[#797D83] focus:border-[#A78BFA]/40 focus:outline-none transition"
            />
          </div>

          {/* Macros grid */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { field: 'calories'  as const, label: 'Kalorien',      unit: 'kcal', step: '1'   },
              { field: 'protein_g' as const, label: 'Eiweiß',        unit: 'g',    step: '0.1' },
              { field: 'carbs_g'   as const, label: 'Kohlenhydrate', unit: 'g',    step: '0.1' },
              { field: 'fat_g'     as const, label: 'Fett',          unit: 'g',    step: '0.1' },
            ] as const).map(({ field, label, unit, step }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-[#797D83] uppercase tracking-wide mb-1.5">
                  {label}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step={step}
                    value={form[field]}
                    onChange={set(field)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.1] rounded-xl text-sm text-[#EDECEA] placeholder-[#797D83] focus:border-[#A78BFA]/40 focus:outline-none transition pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#797D83] pointer-events-none">
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving || !form.meal_name.trim()}
            className="btn-primary press w-full py-3 disabled:opacity-40 text-sm mt-1"
          >
            {saving ? 'Speichern…' : 'Mahlzeit speichern'}
          </button>
        </form>
      </div>

      {/* ── History ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-7 h-7 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="card-secondary">
          <EmptyState
            icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v7a2 2 0 002 2 2 2 0 002-2V3M7 12v9" /><path d="M16 3c-1.4 1-2.2 3-2.2 5.5 0 1.9 1 3 2.2 3.2V21" /></svg>}
            title="Noch keine Mahlzeiten"
            subtext="Trage deine erste Mahlzeit oben ein."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-section">Verlauf</h2>

          {grouped.map(group => {
            const total = group.items.reduce(
              (acc, log) => ({
                calories:  acc.calories  + (log.calories  ?? 0),
                protein_g: acc.protein_g + (log.protein_g ?? 0),
                carbs_g:   acc.carbs_g   + (log.carbs_g   ?? 0),
                fat_g:     acc.fat_g     + (log.fat_g     ?? 0),
              }),
              { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
            )
            const hasAnyMacros = total.calories > 0 || total.protein_g > 0

            return (
              <div key={group.dateKey} className="card-secondary overflow-hidden">
                {/* Day header */}
                <div className="px-5 py-3 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#797D83] uppercase tracking-wide">
                    {group.label}
                  </span>
                  {hasAnyMacros && (
                    <div className="flex items-center gap-2">
                      {total.calories > 0 && (
                        <span className="text-xs font-medium text-[#EDECEA]">{Math.round(total.calories)} kcal</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Meal rows */}
                <ul className="divide-y divide-white/[0.06]">
                  {group.items.map(log => (
                    <li key={log.id} className="flex items-start gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#EDECEA] text-sm leading-snug">{log.meal_name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {log.calories  != null && <MacroBadge value={log.calories}  unit=" kcal" color="text-[#797D83]"  />}
                          {log.protein_g != null && <MacroBadge value={log.protein_g} unit="g E"   color="text-blue-400"  />}
                          {log.carbs_g   != null && <MacroBadge value={log.carbs_g}   unit="g K"   color="text-green-400" />}
                          {log.fat_g     != null && <MacroBadge value={log.fat_g}     unit="g F"   color="text-yellow-400"/>}
                        </div>
                      </div>

                      {/* Re-add button */}
                      <button
                        onClick={() => reAdd(log)}
                        className="flex-shrink-0 text-xs font-semibold text-[#A78BFA] hover:text-[#A78BFA] bg-[#A78BFA]/10 hover:bg-[#A78BFA]/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        + Nochmal
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
