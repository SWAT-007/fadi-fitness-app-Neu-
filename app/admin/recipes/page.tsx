'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecipeRow {
  id: string
  name: string
  ingredients: { name: string; amount: string }[]
  instructions: string
  total_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  servings: number | null
  source_pdf: string
  created_at: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecipesPage() {
  const [recipes,   setRecipes]   = useState<RecipeRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [parsing,   setParsing]   = useState(false)
  const [parseMsg,  setParseMsg]  = useState('')
  const [parseErr,  setParseErr]  = useState('')
  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .order('name', { ascending: true })
    setRecipes((data ?? []) as RecipeRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Parse PDFs ──────────────────────────────────────────────────────────────
  const handleParse = async () => {
    setParsing(true)
    setParseMsg('')
    setParseErr('')

    const res = await fetch('/api/admin/parse-pdfs', { method: 'POST' })
    const json = await res.json()

    if (!res.ok) {
      setParseErr(json.error ?? 'Unbekannter Fehler')
    } else {
      setParseMsg(`${json.inserted ?? json.total_parsed} Rezepte gespeichert (${json.total_parsed} gefunden).`)
      await load()
    }
    setParsing(false)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
    setDeleting(null)
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.source_pdf.toLowerCase().includes(search.toLowerCase()),
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rezepte</h1>
          <p className="text-sm text-gray-500 mt-0.5">{recipes.length} Rezepte in der Datenbank</p>
        </div>
        <button
          onClick={handleParse}
          disabled={parsing}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {parsing ? 'PDFs werden geparst…' : '📄 PDFs einlesen'}
        </button>
      </div>

      {/* Messages */}
      {parseMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
          ✓ {parseMsg}
        </div>
      )}
      {parseErr && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
          Fehler: {parseErr}
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Rezepte suchen…"
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      />

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
          {recipes.length === 0
            ? 'Noch keine Rezepte. PDFs einlesen, um zu starten.'
            : 'Keine Rezepte gefunden.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Row */}
              <div
                className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{r.name}</p>
                  <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-gray-400">
                    {r.total_calories != null && <span>{r.total_calories} kcal</span>}
                    {r.protein_g     != null && <span className="text-blue-500">{r.protein_g}g Protein</span>}
                    {r.carbs_g       != null && <span className="text-green-500">{r.carbs_g}g KH</span>}
                    {r.fat_g         != null && <span className="text-yellow-500">{r.fat_g}g Fett</span>}
                    <span className="text-gray-300">·</span>
                    <span className="truncate max-w-[200px]">{r.source_pdf}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-gray-400 text-lg">{expanded === r.id ? '▲' : '▼'}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                    disabled={deleting === r.id}
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {deleting === r.id ? '…' : 'Löschen'}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === r.id && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4 text-sm">
                  {/* Ingredients */}
                  {r.ingredients.length > 0 && (
                    <div>
                      <p className="font-semibold text-gray-700 mb-2">Zutaten</p>
                      <ul className="space-y-1">
                        {r.ingredients.map((ing, i) => (
                          <li key={i} className="flex gap-2 text-gray-600">
                            {ing.amount && <span className="font-medium text-gray-800 min-w-[60px]">{ing.amount}</span>}
                            <span>{ing.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Instructions */}
                  {r.instructions && (
                    <div>
                      <p className="font-semibold text-gray-700 mb-2">Zubereitung</p>
                      <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{r.instructions}</p>
                    </div>
                  )}

                  {r.servings && (
                    <p className="text-xs text-gray-400">Portionen: {r.servings}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
