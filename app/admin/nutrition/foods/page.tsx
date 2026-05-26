'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FOOD_CATEGORY_LABEL, type Food, type FoodCategory } from '@/lib/types'

const CATEGORIES: FoodCategory[] = ['protein', 'carbs', 'fat', 'vegetable', 'fruit', 'dairy', 'other']

const CAT_COLOR: Record<FoodCategory, string> = {
  protein: 'bg-blue-50 text-blue-700',
  carbs: 'bg-orange-50 text-orange-700',
  fat: 'bg-yellow-50 text-yellow-700',
  vegetable: 'bg-green-50 text-green-700',
  fruit: 'bg-pink-50 text-pink-700',
  dairy: 'bg-purple-50 text-purple-700',
  other: 'bg-gray-100 text-gray-600',
}

type FoodForm = {
  name: string
  category: FoodCategory
  kcal: string
  protein: string
  carbs: string
  fat: string
}

type BackendFood = {
  id: string
  name: string
  caloriesPer100g: number | null
  proteinPer100g: number | null
  carbsPer100g: number | null
  fatPer100g: number | null
  unit: string | null
  createdAt: string
  updatedAt: string
}

const emptyForm = (): FoodForm => ({
  name: '',
  category: 'protein',
  kcal: '0',
  protein: '0',
  carbs: '0',
  fat: '0',
})

const mapBackendFoodToUiFood = (food: BackendFood): Food => ({
  id: food.id,
  name: food.name,
  category: 'other',
  kcal_per_100g: Number(food.caloriesPer100g ?? 0),
  protein_per_100g: Number(food.proteinPer100g ?? 0),
  carbs_per_100g: Number(food.carbsPer100g ?? 0),
  fat_per_100g: Number(food.fatPer100g ?? 0),
  created_by: 'backend',
  created_at: food.createdAt,
})

const mapFormToBackendPayload = (form: FoodForm) => ({
  name: form.name.trim(),
  caloriesPer100g: Number(form.kcal) || 0,
  proteinPer100g: Number(form.protein) || 0,
  carbsPer100g: Number(form.carbs) || 0,
  fatPer100g: Number(form.fat) || 0,
  unit: null as string | null,
})

export default function FoodsDatabasePage() {
  const [foods, setFoods] = useState<Food[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<FoodCategory | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editFood, setEditFood] = useState<Food | null>(null)
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
      const backendFoods = Array.isArray(payload?.foods) ? (payload.foods as BackendFood[]) : []
      setFoods(backendFoods.map(mapBackendFoodToUiFood))
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

  const openEdit = (food: Food) => {
    setEditFood(food)
    setForm({
      name: food.name,
      category: food.category,
      kcal: String(food.kcal_per_100g),
      protein: String(food.protein_per_100g),
      carbs: String(food.carbs_per_100g),
      fat: String(food.fat_per_100g),
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

  const handleDelete = async (food: Food) => {
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
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin/nutrition" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurueck zu Ernaehrungsplaenen
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lebensmittel-Datenbank</h1>
          <p className="text-sm text-gray-500 mt-0.5">{foods.length} Lebensmittel - Naehrwerte pro 100 g</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Lebensmittel hinzufuegen
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
          <h2 className="font-semibold text-gray-900 mb-4">{editFood ? `"${editFood.name}" bearbeiten` : 'Neues Lebensmittel'}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Haehnchenbrust"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Kategorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as FoodCategory }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
              <p className="text-xs font-medium text-gray-600 mb-2">Naehrwerte pro 100 g</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Kalorien (kcal)', key: 'kcal' as const },
                  { label: 'Protein (g)', key: 'protein' as const },
                  { label: 'Kohlenhydrate (g)', key: 'carbs' as const },
                  { label: 'Fett (g)', key: 'fat' as const },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={form[f.key]}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
              {(Number(form.protein) || Number(form.carbs) || Number(form.fat)) > 0 && (
                <p className={`text-xs mt-2 ${Math.abs(macroKcal - Number(form.kcal)) > 30 ? 'text-amber-600' : 'text-green-600'}`}>
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

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">⚠ {error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
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
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value as FoodCategory | 'all')}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="all">Alle Kategorien</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FOOD_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_5rem_4rem_4rem_4rem_5rem] gap-2 px-5 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
          <span>Name</span>
          <span>Kategorie</span>
          <span className="text-right">kcal</span>
          <span className="text-right">Protein</span>
          <span className="text-right">Kohlenhy.</span>
          <span className="text-right">Fett</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">Keine Lebensmittel gefunden.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((food) => (
              <li key={food.id} className="grid grid-cols-[1fr_auto_5rem_4rem_4rem_4rem_5rem] gap-2 items-center px-5 py-3 hover:bg-gray-50 text-sm">
                <span className="font-medium text-gray-900">{food.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLOR[food.category]}`}>
                  {FOOD_CATEGORY_LABEL[food.category]}
                </span>
                <span className="text-right text-orange-600 font-medium">{food.kcal_per_100g}</span>
                <span className="text-right text-blue-600">{food.protein_per_100g}g</span>
                <span className="text-right text-green-600">{food.carbs_per_100g}g</span>
                <span className="text-right text-yellow-600">{food.fat_per_100g}g</span>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => openEdit(food)}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Bearbeiten
                  </button>
                  <button
                    onClick={() => handleDelete(food)}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Loeschen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

