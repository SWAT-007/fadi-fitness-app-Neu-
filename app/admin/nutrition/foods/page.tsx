'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FOOD_CATEGORY_LABEL, type FoodCategory } from '@/lib/types'

const CATEGORIES: FoodCategory[] = ['protein', 'carbs', 'fat', 'vegetable', 'fruit', 'dairy', 'other']

const CAT_COLOR: Record<FoodCategory, string> = {
  protein:   'bg-blue-500/10 text-blue-400',
  carbs:     'bg-amber-500/10 text-amber-400',
  fat:       'bg-yellow-500/10 text-yellow-300',
  vegetable: 'bg-emerald-500/10 text-emerald-400',
  fruit:     'bg-pink-500/10 text-pink-400',
  dairy:     'bg-violet-500/10 text-violet-400',
  other:     'bg-white/[0.06] text-[#797D83]',
}

type BackendFood = {
  id: string
  name: string
  caloriesPer100g: number | null
  proteinPer100g: number | null
  carbsPer100g: number | null
  fatPer100g: number | null
  unit: string | null
  category: string | null
  brand: string | null
  barcode: string | null
  defaultServingG: number | null
  source: string | null
  createdAt: string
  updatedAt: string
}

type FoodForm = {
  name: string
  category: FoodCategory
  kcal: string
  protein: string
  carbs: string
  fat: string
  brand: string
  barcode: string
  defaultServingG: string
  source: string
}

const emptyForm = (): FoodForm => ({
  name: '',
  category: 'protein',
  kcal: '0',
  protein: '0',
  carbs: '0',
  fat: '0',
  brand: '',
  barcode: '',
  defaultServingG: '',
  source: '',
})

const mapFormToBackendPayload = (form: FoodForm) => ({
  name: form.name.trim(),
  category: form.category,
  caloriesPer100g: Number(form.kcal) || 0,
  proteinPer100g: Number(form.protein) || 0,
  carbsPer100g: Number(form.carbs) || 0,
  fatPer100g: Number(form.fat) || 0,
  unit: null as string | null,
  brand: form.brand.trim() || null,
  barcode: form.barcode.trim() || null,
  defaultServingG: form.defaultServingG.trim() ? Number(form.defaultServingG) || null : null,
  source: form.source.trim() || null,
})

const inputCls = 'w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]'
const labelCls = 'block text-xs font-medium text-[#797D83] mb-1.5'

function macroVal(v: number | null): string {
  return v != null ? `${v}g` : '–'
}

export default function FoodsDatabasePage() {
  const [foods, setFoods] = useState<BackendFood[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<FoodCategory | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editFood, setEditFood] = useState<BackendFood | null>(null)
  const [form, setForm] = useState<FoodForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/backend/nutrition/foods', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setFoods([])
        setError(payload?.message ?? 'Fehler beim Laden der Lebensmittel.')
        setLoading(false)
        return
      }
      setFoods(Array.isArray(payload?.foods) ? (payload.foods as BackendFood[]) : [])
      setError(null)
      setLoading(false)
    } catch {
      setFoods([])
      setError('Backend nicht erreichbar.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = foods.filter((f) => {
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'all' || f.category === filterCat
    return matchSearch && matchCat
  })

  const openAdd = () => {
    setEditFood(null)
    setForm(emptyForm())
    setError(null)
    setShowForm(true)
  }

  const openEdit = (food: BackendFood) => {
    setEditFood(food)
    setForm({
      name: food.name,
      category: (food.category && CATEGORIES.includes(food.category as FoodCategory)
        ? food.category
        : 'other') as FoodCategory,
      kcal: String(food.caloriesPer100g ?? 0),
      protein: String(food.proteinPer100g ?? 0),
      carbs: String(food.carbsPer100g ?? 0),
      fat: String(food.fatPer100g ?? 0),
      brand: food.brand ?? '',
      barcode: food.barcode ?? '',
      defaultServingG: food.defaultServingG != null ? String(food.defaultServingG) : '',
      source: food.source ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name ist erforderlich.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = mapFormToBackendPayload(form)

    try {
      if (editFood) {
        const response = await fetch(`/api/backend/nutrition/foods/${editFood.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await response.json().catch(() => null)
        if (!response.ok) {
          setError(result?.message ?? 'Fehler beim Aktualisieren.')
          setSaving(false)
          return
        }
      } else {
        const response = await fetch('/api/backend/nutrition/foods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await response.json().catch(() => null)
        if (!response.ok) {
          setError(result?.message ?? 'Fehler beim Erstellen.')
          setSaving(false)
          return
        }
      }

      setSaving(false)
      setShowForm(false)
      await load()
    } catch {
      setError('Backend nicht erreichbar.')
      setSaving(false)
    }
  }

  const handleDelete = async (food: BackendFood) => {
    if (!confirm(`"${food.name}" wirklich loeschen?`)) return

    try {
      const response = await fetch(`/api/backend/nutrition/foods/${food.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        alert(result?.message ?? 'Loeschen fehlgeschlagen.')
        return
      }
      await load()
    } catch {
      alert('Backend nicht erreichbar.')
    }
  }

  const macroKcal = Math.round(Number(form.protein) * 4 + Number(form.carbs) * 4 + Number(form.fat) * 9)

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin/nutrition" className="inline-flex items-center gap-1.5 text-sm text-[#797D83] hover:text-[#EDECEA] mb-5 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurueck zu Ernaehrungsplaenen
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#EDECEA]">Lebensmittel-Datenbank</h1>
          <p className="text-sm text-[#797D83] mt-0.5">{foods.length} Lebensmittel · Naehrwerte pro 100 g</p>
        </div>
        <button
          onClick={openAdd}
          className="press flex items-center gap-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Lebensmittel hinzufuegen
        </button>
      </div>

      {showForm && (
        <div className="bg-[#111318] rounded-2xl border border-white/[0.08] shadow-lg p-6 mb-5">
          <h2 className="font-semibold text-[#EDECEA] mb-4">
            {editFood ? `"${editFood.name}" bearbeiten` : 'Neues Lebensmittel'}
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Haehnchenbrust"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Kategorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as FoodCategory }))}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {FOOD_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-[#797D83] mb-2">Naehrwerte pro 100 g</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Kalorien (kcal)', key: 'kcal' as const },
                  { label: 'Protein (g)', key: 'protein' as const },
                  { label: 'Kohlenhydrate (g)', key: 'carbs' as const },
                  { label: 'Fett (g)', key: 'fat' as const },
                ].map((f) => (
                  <div key={f.key}>
                    <label className={labelCls}>{f.label}</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={form[f.key]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
              {(Number(form.protein) || Number(form.carbs) || Number(form.fat)) > 0 && (
                <p className={`text-xs mt-2 ${Math.abs(macroKcal - Number(form.kcal)) > 30 ? 'text-amber-400' : 'text-[#A78BFA]'}`}>
                  Aus Makros berechnet: {macroKcal} kcal
                  {Math.abs(macroKcal - Number(form.kcal)) > 30 && (
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => setForm((p) => ({ ...p, kcal: String(macroKcal) }))}
                    >
                      Uebernehmen
                    </button>
                  )}
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Marke</label>
                <input
                  value={form.brand}
                  onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))}
                  placeholder="z.B. Rewe, Lidl"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Barcode (EAN)</label>
                <input
                  value={form.barcode}
                  onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
                  placeholder="z.B. 4001234567890"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Portionsgroesse (g)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.defaultServingG}
                  onChange={(e) => setForm((p) => ({ ...p, defaultServingG: e.target.value }))}
                  placeholder="z.B. 100"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Quelle</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                  placeholder="z.B. USDA, Hersteller"
                  className={inputCls}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                &#9888; {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="press flex-1 py-2.5 border border-white/[0.08] text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.04] text-sm rounded-xl transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="press flex-1 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors"
              >
                {saving ? 'Speichern...' : editFood ? 'Aktualisieren' : 'Hinzufuegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen..."
          className="flex-1 px-4 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value as FoodCategory | 'all')}
          className="px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition"
        >
          <option value="all">Alle Kategorien</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FOOD_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-[#111318] rounded-2xl border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_5rem_4rem_4rem_4rem_6rem] gap-2 px-5 py-2.5 text-xs font-medium text-[#555A61] uppercase tracking-wide border-b border-white/[0.06]">
          <span>Name</span>
          <span>Kategorie</span>
          <span className="text-right">kcal</span>
          <span className="text-right">Protein</span>
          <span className="text-right">Kohlenhy.</span>
          <span className="text-right">Fett</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-[#555A61] text-sm">Keine Lebensmittel gefunden.</div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((food) => {
              const catKey = (food.category && CATEGORIES.includes(food.category as FoodCategory)
                ? food.category
                : 'other') as FoodCategory
              const meta = [
                food.brand,
                food.barcode,
                food.defaultServingG != null ? `${food.defaultServingG}g` : null,
                food.source,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li
                  key={food.id}
                  className="grid grid-cols-[1fr_auto_5rem_4rem_4rem_4rem_6rem] gap-2 items-center px-5 py-3 hover:bg-white/[0.02] text-sm transition-colors"
                >
                  <div>
                    <p className="font-medium text-[#EDECEA]">{food.name}</p>
                    {meta && <p className="text-xs text-[#555A61] mt-0.5">{meta}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLOR[catKey]}`}>
                    {FOOD_CATEGORY_LABEL[catKey]}
                  </span>
                  <span className="text-right text-[#EDECEA] font-medium tabular-nums">{food.caloriesPer100g ?? '–'}</span>
                  <span className="text-right text-blue-400 tabular-nums">{macroVal(food.proteinPer100g)}</span>
                  <span className="text-right text-amber-400 tabular-nums">{macroVal(food.carbsPer100g)}</span>
                  <span className="text-right text-yellow-300 tabular-nums">{macroVal(food.fatPer100g)}</span>
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => openEdit(food)}
                      className="press px-2 py-1 text-xs text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.06] rounded-lg transition-colors"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => handleDelete(food)}
                      className="press px-2 py-1 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      Loeschen
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
