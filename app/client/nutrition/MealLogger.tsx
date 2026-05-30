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
  dateKey: string
  label: string
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

const EMPTY: MealForm = { meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' }

function toLocalDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayKey() { return toLocalDateKey(new Date().toISOString()) }
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return toLocalDateKey(d.toISOString())
}

function humanLabel(key: string): string {
  if (key === todayKey()) return 'Heute'
  if (key === yesterdayKey()) return 'Gestern'
  const [y, m, day] = key.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function groupByDate(logs: MealLog[]): DayGroup[] {
  const map = new Map<string, MealLog[]>()
  for (const log of logs) {
    const key = toLocalDateKey(log.logged_at)
    const bucket = map.get(key) ?? []
    bucket.push(log)
    map.set(key, bucket)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ dateKey: key, label: humanLabel(key), items }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealLogger() {
  const formRef = useRef<HTMLDivElement>(null)

  const [logs, setLogs]       = useState<MealLog[]>([])
  const [form, setForm]       = useState<MealForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [flash, setFlash]     = useState('')

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/backend/me/nutrition/meal-logs')
      const data = res.ok ? await res.json().catch(() => null) : null
      setLogs(((data?.mealLogs ?? []) as BackendMealLog[]).map(mapMealLog))
      setLoading(false)
    }
    load()
  }, [])

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
        setError(data?.message ?? 'Fehler.')
        setSaving(false)
        return
      }
      const data = await res.json().catch(() => null)
      if (data?.mealLog) {
        setLogs(prev => [mapMealLog(data.mealLog as BackendMealLog), ...prev])
        setForm(EMPTY)
        setFlash('✓ Mahlzeit gespeichert')
        setTimeout(() => setFlash(''), 2500)
      }
    } catch {
      setError('Fehler.')
    }
    setSaving(false)
  }

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

  const set = (field: keyof MealForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))

  const grouped = groupByDate(logs)

  return (
    <div className="space-y-4">
      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <div ref={formRef} className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5">
        <h2 className="font-semibold text-[#EDECEA] mb-4">Mahlzeit eintragen</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-3">{error}</div>
        )}
        {flash && (
          <div className="bg-[#A78BFA]/[0.08] border border-[#A78BFA]/20 text-[#A78BFA] text-sm px-4 py-3 rounded-xl mb-3">{flash}</div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#797D83] uppercase tracking-wide mb-1.5">Bezeichnung</label>
            <input
              value={form.meal_name}
              onChange={set('meal_name')}
              required
              placeholder="z.B. Haferflocken mit Beeren"
              className="w-full px-4 py-2.5 border border-white/[0.1] rounded-xl text-sm focus:border-[#A78BFA]/40 focus:outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              { field: 'calories'  as const, label: 'Kalorien',      unit: 'kcal', step: '1'   },
              { field: 'protein_g' as const, label: 'Eiweiß',        unit: 'g',    step: '0.1' },
              { field: 'carbs_g'   as const, label: 'Kohlenhydrate', unit: 'g',    step: '0.1' },
              { field: 'fat_g'     as const, label: 'Fett',          unit: 'g',    step: '0.1' },
            ] as const).map(({ field, label, unit, step }) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-[#797D83] uppercase tracking-wide mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type="number" min="0" step={step}
                    value={form[field]}
                    onChange={set(field)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-white/[0.1] rounded-xl text-sm focus:border-[#A78BFA]/40 focus:outline-none transition pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#797D83] pointer-events-none">{unit}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving || !form.meal_name.trim()}
            className="w-full py-3 bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-40 text-[#050504] font-semibold rounded-xl transition-colors text-sm"
          >
            {saving ? 'Speichern…' : 'Mahlzeit speichern'}
          </button>
        </form>
      </div>

      {/* ── History ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-7 h-7 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-8 text-center shadow-sm">
          <div className="text-3xl mb-2">🍽️</div>
          <p className="text-[#797D83] text-sm">Noch keine Mahlzeiten eingetragen.</p>
        </div>
      ) : (
        <>
          <h3 className="font-semibold text-[#EDECEA] pt-2">Verlauf</h3>
          {grouped.map(group => {
            const totalKcal = group.items.reduce((s, l) => s + (l.calories ?? 0), 0)
            return (
              <div key={group.dateKey} className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
                <div className="px-5 py-3 bg-white/[0.03] border-b border-white/[0.04] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#797D83] uppercase tracking-wide">{group.label}</span>
                  {totalKcal > 0 && <span className="text-xs font-medium text-[#797D83]">{Math.round(totalKcal)} kcal</span>}
                </div>
                <ul className="divide-y divide-white/[0.04]">
                  {group.items.map(log => (
                    <li key={log.id} className="flex items-start gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#EDECEA] text-sm">{log.meal_name}</p>
                        <div className="flex flex-wrap gap-x-3 mt-1">
                          {log.calories  != null && <span className="text-xs text-[#797D83]">{log.calories} kcal</span>}
                          {log.protein_g != null && <span className="text-xs text-blue-400">{log.protein_g}g E</span>}
                          {log.carbs_g   != null && <span className="text-xs text-[#A78BFA]">{log.carbs_g}g K</span>}
                          {log.fat_g     != null && <span className="text-xs text-amber-400">{log.fat_g}g F</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => reAdd(log)}
                        className="flex-shrink-0 text-xs font-semibold text-[#A78BFA] hover:text-[#A78BFA] bg-[#A78BFA]/10 hover:bg-[#A78BFA]/15 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        + Nochmal
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
