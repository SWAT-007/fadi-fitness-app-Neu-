'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FOOD_CATEGORY_LABEL, type FoodCategory } from '@/lib/types'
import BarcodeScannerModal from '@/components/BarcodeScannerModal'

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

function guessCategory(protein: number, carbs: number, fat: number, tags: string[]): FoodCategory {
  const tagStr = tags.join(' ').toLowerCase()
  if (/vegetable|gemüse|légume|verdura|vegetal/.test(tagStr)) return 'vegetable'
  if (/fruit|obst|frücht/.test(tagStr)) return 'fruit'
  if (/dairy|milch|lait|latte|yaourt|yogurt|käse|cheese/.test(tagStr)) return 'dairy'
  const pCal = protein * 4, cCal = carbs * 4, fCal = fat * 9
  const total = pCal + cCal + fCal || 1
  if (protein > 15 && pCal / total >= 0.25) return 'protein'
  if (fat > 20 && fCal / total >= 0.5) return 'fat'
  if (carbs > 30 && cCal / total >= 0.4) return 'carbs'
  if (protein > 10) return 'protein'
  if (fat > 15) return 'fat'
  return 'other'
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
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupMsg, setLookupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showScanner, setShowScanner] = useState(false)

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

  const handleScannerResult = (scanned: string) => {
    setShowScanner(false)
    setForm(p => ({ ...p, barcode: scanned }))
    setLookupMsg(null)
    handleBarcodeSearch(scanned)
  }

  const handleBarcodeSearch = async (overrideCode?: string) => {
    const code = (overrideCode ?? form.barcode).trim()
    if (!code) {
      setLookupMsg({ type: 'err', text: 'Bitte zuerst einen Barcode eingeben.' })
      return
    }
    setLookingUp(true)
    setLookupMsg(null)
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
        { cache: 'no-store' }
      )
      const data = await res.json().catch(() => null) as {
        status: number
        product?: {
          product_name?: string
          product_name_de?: string
          brands?: string
          nutriments?: Record<string, number>
          categories_tags?: string[]
        }
      } | null

      if (!data || data.status !== 1 || !data.product) {
        setLookupMsg({ type: 'err', text: 'Produkt nicht gefunden. Barcode prüfen.' })
        return
      }

      const p = data.product
      const nut = p.nutriments ?? {}
      const kcal    = Math.round(Number(nut['energy-kcal_100g'] ?? nut['energy-kcal'] ?? 0))
      const protein = Math.round((Number(nut['proteins_100g']       ?? 0)) * 10) / 10
      const carbs   = Math.round((Number(nut['carbohydrates_100g']  ?? 0)) * 10) / 10
      const fat     = Math.round((Number(nut['fat_100g']            ?? 0)) * 10) / 10
      const name    = (p.product_name_de || p.product_name || '').trim()
      const brand   = (p.brands ?? '').trim()
      const tags    = Array.isArray(p.categories_tags) ? p.categories_tags : []

      setForm(prev => ({
        ...prev,
        name:     name  || prev.name,
        brand:    brand || prev.brand,
        kcal:     String(kcal),
        protein:  String(protein),
        carbs:    String(carbs),
        fat:      String(fat),
        source:   'open_food_facts',
        category: guessCategory(protein, carbs, fat, tags),
      }))
      setLookupMsg({ type: 'ok', text: `Produkt gefunden: ${name || code}` })
    } catch {
      setLookupMsg({ type: 'err', text: 'API-Fehler. Bitte Internetverbindung prüfen.' })
    } finally {
      setLookingUp(false)
    }
  }

  // Auto-compute kcal whenever a macro changes
  const handleMacroChange = (key: 'protein' | 'carbs' | 'fat', value: string) => {
    setForm(p => {
      const next = { ...p, [key]: value }
      const protein = Math.max(0, Number(key === 'protein' ? value : p.protein) || 0)
      const carbs   = Math.max(0, Number(key === 'carbs'   ? value : p.carbs)   || 0)
      const fat     = Math.max(0, Number(key === 'fat'     ? value : p.fat)     || 0)
      return { ...next, kcal: String(Math.round(protein * 4 + carbs * 4 + fat * 9)) }
    })
  }

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
                {/* kcal: manual-only, auto-updated when macros change */}
                <div>
                  <label className={labelCls}>Kalorien (kcal)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.kcal}
                    onChange={(e) => setForm((p) => ({ ...p, kcal: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => { if (!e.target.value.trim()) setForm(p => ({ ...p, kcal: '0' })) }}
                    className={inputCls}
                  />
                </div>
                {/* protein / carbs / fat: auto-update kcal on change */}
                {([
                  { label: 'Protein (g)',       key: 'protein' as const },
                  { label: 'Kohlenhydrate (g)', key: 'carbs'   as const },
                  { label: 'Fett (g)',           key: 'fat'     as const },
                ] as const).map((f) => (
                  <div key={f.key}>
                    <label className={labelCls}>{f.label}</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={form[f.key]}
                      onChange={(e) => handleMacroChange(f.key, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => { if (!e.target.value.trim()) setForm(p => ({ ...p, [f.key]: '0' })) }}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
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
                <div className="flex gap-2">
                  <input
                    value={form.barcode}
                    onChange={(e) => { setForm((p) => ({ ...p, barcode: e.target.value })); setLookupMsg(null) }}
                    placeholder="z.B. 4001234567890"
                    className={`${inputCls} flex-1 min-w-0`}
                  />
                  <button
                    type="button"
                    onClick={() => handleBarcodeSearch()}
                    disabled={lookingUp || !form.barcode.trim()}
                    className="press shrink-0 px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] text-[#A78BFA] text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {lookingUp ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-[#A78BFA] border-t-transparent rounded-full animate-spin inline-block" />
                        Suche…
                      </span>
                    ) : 'Produkt suchen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    title="Barcode mit Kamera scannen"
                    className="press shrink-0 p-2.5 bg-white/[0.06] hover:bg-white/[0.09] border border-white/[0.08] text-[#A78BFA] rounded-xl transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </button>
                </div>
                {lookupMsg && (
                  <p className={`text-xs mt-1.5 px-2.5 py-1.5 rounded-lg ${
                    lookupMsg.type === 'ok'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-red-400 bg-red-500/10 border border-red-500/20'
                  }`}>
                    {lookupMsg.type === 'ok' ? '✓ ' : '⚠ '}{lookupMsg.text}
                  </p>
                )}
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
                  onFocus={(e) => e.target.select()}
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
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[1fr_auto_5rem_4.5rem_4.5rem_4.5rem_11rem] gap-x-3 px-5 py-2.5 text-xs font-medium text-[#555A61] uppercase tracking-wide border-b border-white/[0.06]">
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
                      className="grid grid-cols-[1fr_auto_5rem_4.5rem_4.5rem_4.5rem_11rem] gap-x-3 items-center px-5 py-3 hover:bg-white/[0.02] text-sm transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#EDECEA] truncate">{food.name}</p>
                        {meta && <p className="text-xs text-[#555A61] mt-0.5 truncate">{meta}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${CAT_COLOR[catKey]}`}>
                        {FOOD_CATEGORY_LABEL[catKey]}
                      </span>
                      <span className="text-right text-[#EDECEA] font-medium tabular-nums">{food.caloriesPer100g ?? '–'}</span>
                      <span className="text-right text-blue-400 tabular-nums">{macroVal(food.proteinPer100g)}</span>
                      <span className="text-right text-amber-400 tabular-nums">{macroVal(food.carbsPer100g)}</span>
                      <span className="text-right text-yellow-300 tabular-nums">{macroVal(food.fatPer100g)}</span>
                      <div className="flex gap-2 justify-end items-center">
                        <button
                          onClick={() => openEdit(food)}
                          className="press shrink-0 px-2.5 py-1 text-xs text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.06] rounded-lg transition-colors"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDelete(food)}
                          className="press shrink-0 px-2.5 py-1 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          Löschen
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showScanner && (
        <BarcodeScannerModal
          onScan={handleScannerResult}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
