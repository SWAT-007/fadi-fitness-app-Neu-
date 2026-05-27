'use client'

import { useEffect, useRef, useState } from 'react'
import type { MealLog } from '@/lib/types'

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
  createdAt: string
  updatedAt: string
}

function mapMealLog(m: BackendMealLog): MealLog {
  return {
    id: m.id,
    client_id: m.clientId,
    meal_name: m.mealType ?? '',
    // calories / protein_g / carbs_g / fat_g not in backend model — deferred
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
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
      const res = await fetch('/api/backend/me/nutrition/meal-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealType: form.meal_name.trim() }),
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
      <h1 className="text-xl font-bold text-gray-900">Freies Protokoll</h1>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        Für freie Einträge. Dein Haupt-Ernährungsplan ist unter Ernährung.
      </p>

      {/* ── Log Form ────────────────────────────────────────────────────────── */}
      <div ref={formRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Neuer Eintrag</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-3">
            {error}
          </div>
        )}
        {flash && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl mb-3">
            {flash}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Bezeichnung
            </label>
            <input
              value={form.meal_name}
              onChange={set('meal_name')}
              required
              placeholder="z.B. Haferflocken mit Beeren"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
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
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
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
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving || !form.meal_name.trim()}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm mt-1"
          >
            {saving ? 'Speichern…' : 'Mahlzeit speichern'}
          </button>
        </form>
      </div>

      {/* ── History ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">🍽️</div>
          <p className="text-gray-500 text-sm">Noch keine Mahlzeiten eingetragen.</p>
          <p className="text-gray-400 text-xs mt-1">Trage deine erste Mahlzeit oben ein.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Verlauf</h2>

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
              <div key={group.dateKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Day header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {group.label}
                  </span>
                  {hasAnyMacros && (
                    <div className="flex items-center gap-2">
                      {total.calories > 0 && (
                        <span className="text-xs font-medium text-gray-600">{Math.round(total.calories)} kcal</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Meal rows */}
                <ul className="divide-y divide-gray-100">
                  {group.items.map(log => (
                    <li key={log.id} className="flex items-start gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm leading-snug">{log.meal_name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          {log.calories  != null && <MacroBadge value={log.calories}  unit=" kcal" color="text-gray-500"   />}
                          {log.protein_g != null && <MacroBadge value={log.protein_g} unit="g E"   color="text-blue-600"  />}
                          {log.carbs_g   != null && <MacroBadge value={log.carbs_g}   unit="g K"   color="text-green-600" />}
                          {log.fat_g     != null && <MacroBadge value={log.fat_g}     unit="g F"   color="text-yellow-600"/>}
                        </div>
                      </div>

                      {/* Re-add button */}
                      <button
                        onClick={() => reAdd(log)}
                        className="flex-shrink-0 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
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
