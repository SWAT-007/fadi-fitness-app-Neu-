'use client'

import { useEffect, useState } from 'react'

interface RecipeRow {
  id: string
  name: string
  description: string | null
  instructions: string | null
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/backend/nutrition/recipes')
    const data = res.ok ? await res.json().catch(() => null) : null
    setRecipes((data?.recipes ?? []) as RecipeRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    const res = await fetch(`/api/backend/nutrition/recipes/${id}`, { method: 'DELETE' })
    if (res.ok) setRecipes((prev) => prev.filter((r) => r.id !== id))
    setDeleting(null)
  }

  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rezepte</h1>
          <p className="text-sm text-gray-500 mt-0.5">{recipes.length} Rezepte in der Datenbank</p>
        </div>
        <button
          disabled
          className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-semibold rounded-xl cursor-not-allowed"
          title="PDF-Import wird nach der Rezept-Schema-Migration wieder aktiviert."
        >
          PDF-Import vorübergehend deaktiviert
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
        PDF-Import wird nach der Rezept-Schema-Migration wieder aktiviert.
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rezepte suchen..."
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
          {recipes.length === 0 ? 'Noch keine Rezepte vorhanden.' : 'Keine Rezepte gefunden.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-snug">{r.name}</p>
                  {r.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">{r.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-gray-400 text-lg">{expanded === r.id ? '▲' : '▼'}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(r.id)
                    }}
                    disabled={deleting === r.id}
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {deleting === r.id ? '...' : 'Löschen'}
                  </button>
                </div>
              </div>

              {expanded === r.id && r.instructions && (
                <div className="border-t border-gray-100 px-5 py-4 text-sm">
                  <p className="font-semibold text-gray-700 mb-2">Zubereitung</p>
                  <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{r.instructions}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
