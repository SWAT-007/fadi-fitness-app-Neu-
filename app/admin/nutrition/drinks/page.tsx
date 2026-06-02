'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type BackendDrink = {
  id: string
  name: string
  kcalPer100ml: number | null
  unit: string | null
  createdAt: string
  updatedAt: string
}

type DrinkForm = {
  name: string
  kcalPer100ml: string
  unit: string
}

const emptyForm = (): DrinkForm => ({
  name: '',
  kcalPer100ml: '0',
  unit: 'ml',
})

const mapFormToBackendPayload = (form: DrinkForm) => ({
  name: form.name.trim(),
  kcalPer100ml: Number(form.kcalPer100ml) || 0,
  unit: form.unit.trim() || null,
})

const inputCls = 'w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-[#EDECEA] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent transition placeholder:text-[#555A61]'
const labelCls = 'block text-xs font-medium text-[#797D83] mb-1.5'

export default function DrinksDatabasePage() {
  const [drinks, setDrinks] = useState<BackendDrink[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editDrink, setEditDrink] = useState<BackendDrink | null>(null)
  const [form, setForm] = useState<DrinkForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/backend/nutrition/drinks', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setDrinks([])
        setError(payload?.message ?? 'Fehler beim Laden der Getränke.')
        setLoading(false)
        return
      }
      setDrinks(Array.isArray(payload?.drinks) ? (payload.drinks as BackendDrink[]) : [])
      setError(null)
      setLoading(false)
    } catch {
      setDrinks([])
      setError('Backend nicht erreichbar.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = drinks.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))

  const openAdd = () => {
    setEditDrink(null)
    setForm(emptyForm())
    setError(null)
    setShowForm(true)
  }

  const openEdit = (drink: BackendDrink) => {
    setEditDrink(drink)
    setForm({
      name: drink.name,
      kcalPer100ml: String(drink.kcalPer100ml ?? 0),
      unit: drink.unit ?? '',
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
      if (editDrink) {
        const response = await fetch(`/api/backend/nutrition/drinks/${editDrink.id}`, {
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
        const response = await fetch('/api/backend/nutrition/drinks', {
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

  const handleDelete = async (drink: BackendDrink) => {
    if (!confirm(`"${drink.name}" wirklich loeschen?`)) return

    try {
      const response = await fetch(`/api/backend/nutrition/drinks/${drink.id}`, { method: 'DELETE' })
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
          <h1 className="text-2xl font-bold text-[#EDECEA]">Getränke-Datenbank</h1>
          <p className="text-sm text-[#797D83] mt-0.5">{drinks.length} Getränke · kcal pro 100 ml</p>
        </div>
        <button
          onClick={openAdd}
          className="press flex items-center gap-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          + Getränk hinzufuegen
        </button>
      </div>

      {showForm && (
        <div className="bg-[#111318] rounded-2xl border border-white/[0.08] shadow-lg p-6 mb-5">
          <h2 className="font-semibold text-[#EDECEA] mb-4">
            {editDrink ? `"${editDrink.name}" bearbeiten` : 'Neues Getränk'}
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-[1fr_8rem_8rem] gap-4">
              <div>
                <label className={labelCls}>Name *</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Orangensaft"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Kalorien (kcal/100 ml)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.kcalPer100ml}
                  onChange={(e) => setForm((p) => ({ ...p, kcalPer100ml: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { if (!e.target.value.trim()) setForm(p => ({ ...p, kcalPer100ml: '0' })) }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Einheit</label>
                <input
                  value={form.unit}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  placeholder="z.B. ml"
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
                {saving ? 'Speichern...' : editDrink ? 'Aktualisieren' : 'Hinzufuegen'}
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
      </div>

      <div className="bg-[#111318] rounded-2xl border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[1fr_7rem_5rem_11rem] gap-x-3 px-5 py-2.5 text-xs font-medium text-[#555A61] uppercase tracking-wide border-b border-white/[0.06]">
              <span>Name</span>
              <span className="text-right">kcal/100 ml</span>
              <span>Einheit</span>
              <span />
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center text-[#555A61] text-sm">Keine Getränke gefunden.</div>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {filtered.map((drink) => (
                  <li
                    key={drink.id}
                    className="grid grid-cols-[1fr_7rem_5rem_11rem] gap-x-3 items-center px-5 py-3 hover:bg-white/[0.02] text-sm transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#EDECEA] truncate">{drink.name}</p>
                    </div>
                    <span className="text-right text-[#EDECEA] font-medium tabular-nums">{drink.kcalPer100ml ?? '–'}</span>
                    <span className="text-[#797D83]">{drink.unit ?? '–'}</span>
                    <div className="flex gap-2 justify-end items-center">
                      <button
                        onClick={() => openEdit(drink)}
                        className="press shrink-0 px-2.5 py-1 text-xs text-[#797D83] hover:text-[#EDECEA] hover:bg-white/[0.06] rounded-lg transition-colors"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(drink)}
                        className="press shrink-0 px-2.5 py-1 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        Löschen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
