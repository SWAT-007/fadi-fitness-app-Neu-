'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipe {
  id: string
  name: string
  description: string | null
  instructions: string | null
  imageUrl: string | null
  ingredients: unknown
  servings: number | null
  totalCalories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  category: string | null
  prepTimeMinutes: number | null
  cookTimeMinutes: number | null
  createdAt: string
  updatedAt: string
}

interface Props {
  /** Client's daily calorie target from the assigned nutrition plan */
  targetCalories: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIngredients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const result: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const s = item.trim()
      if (s) result.push(s)
    } else if (item && typeof item === 'object' && 'name' in item) {
      const n = (item as { name: unknown }).name
      if (typeof n === 'string' && n.trim()) result.push(n.trim())
    }
  }
  return result
}

// ─── Collapsible (local copy — identical to the one in page.tsx) ─────────────

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    setHeight(el.scrollHeight)
    const ro = new ResizeObserver(() => setHeight(el.scrollHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      style={{
        maxHeight: open ? `${height}px` : '0px',
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        transition: 'max-height 300ms cubic-bezier(0.4,0,0.2,1), opacity 250ms ease',
      }}
    >
      <div ref={innerRef}>
        {children}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecipeSuggestions({ targetCalories }: Props) {
  const [recipes,      setRecipes]      = useState<Recipe[]>([])
  const [loading,      setLoading]      = useState(true)
  const [sectionOpen,  setSectionOpen]  = useState(false)
  const [openIds,      setOpenIds]      = useState<Set<string>>(new Set())
  const [search,       setSearch]       = useState('')

  const toggle = (id: string) =>
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/backend/nutrition/recipes?limit=500')
      const data = res.ok ? await res.json().catch(() => null) : null
      setRecipes((data?.recipes ?? []) as Recipe[])
      setLoading(false)
    }
    load()
  }, [])

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const filtered = recipes
    .filter(r => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (recipes.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ── Level 1: section header — always visible ── */}
      <button
        onClick={() => setSectionOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-2 px-5 py-4 hover:bg-gray-50/60 transition-colors"
      >
        <div>
          <h2 className="font-bold text-gray-900">Rezeptvorschl&#228;ge</h2>
          {targetCalories ? (
            <p className="text-xs text-gray-400 mt-0.5">
              T&#228;gliches Kalorienziel: {targetCalories} kcal · {recipes.length} Rezepte
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">{recipes.length} Rezepte verf&#252;gbar</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${sectionOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Level 1: collapsible body ── */}
      <Collapsible open={sectionOpen}>
        <div className="px-5 pb-5 space-y-3 border-t border-gray-100">

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rezept suchen&#8230;"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />

          {/* Cards */}
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Keine Rezepte gefunden.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => {
                const isOpen = openIds.has(r.id)
                const ingredients = parseIngredients(r.ingredients)
                const hasMacros = r.totalCalories != null || r.proteinG != null || r.carbsG != null || r.fatG != null
                const hasDetails = hasMacros || ingredients.length > 0 || !!r.instructions || r.prepTimeMinutes != null || r.cookTimeMinutes != null

                return (
                  <div
                    key={r.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Card header */}
                    <button
                      onClick={() => toggle(r.id)}
                      className="w-full text-left flex items-start justify-between gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{r.name}</p>
                          {r.category && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0 font-medium">
                              {r.category}
                            </span>
                          )}
                        </div>
                        {r.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>
                        )}
                        {hasMacros && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {[
                              r.totalCalories != null ? `${Math.round(r.totalCalories)} kcal` : null,
                              r.proteinG != null ? `${Math.round(r.proteinG)}P` : null,
                              r.carbsG != null ? `${Math.round(r.carbsG)}K` : null,
                              r.fatG != null ? `${Math.round(r.fatG)}F` : null,
                            ].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Collapsible body */}
                    <Collapsible open={isOpen}>
                      <div className="border-t border-gray-100 px-5 py-4 space-y-3 text-sm">

                        {/* Macro chips */}
                        {hasMacros && (
                          <div className="flex flex-wrap gap-1.5">
                            {r.totalCalories != null && (
                              <span className="text-[11px] px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full font-medium">
                                {Math.round(r.totalCalories)} kcal
                              </span>
                            )}
                            {r.proteinG != null && (
                              <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                                P {Math.round(r.proteinG)}g
                              </span>
                            )}
                            {r.carbsG != null && (
                              <span className="text-[11px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                                K {Math.round(r.carbsG)}g
                              </span>
                            )}
                            {r.fatG != null && (
                              <span className="text-[11px] px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full">
                                F {Math.round(r.fatG)}g
                              </span>
                            )}
                            {r.servings != null && (
                              <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                {r.servings} {r.servings === 1 ? 'Portion' : 'Portionen'}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Prep / cook time */}
                        {(r.prepTimeMinutes != null || r.cookTimeMinutes != null) && (
                          <p className="text-[11px] text-gray-400">
                            {[
                              r.prepTimeMinutes != null ? `${r.prepTimeMinutes} Min. Vorbereitung` : null,
                              r.cookTimeMinutes != null ? `${r.cookTimeMinutes} Min. Kochen` : null,
                            ].filter(Boolean).join(' + ')}
                          </p>
                        )}

                        {/* Ingredients */}
                        {ingredients.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700 mb-1.5">Zutaten</p>
                            <ul className="space-y-0.5">
                              {ingredients.map((ing, idx) => (
                                <li key={idx} className="flex items-start gap-1.5 text-xs text-gray-600">
                                  <span className="text-green-400 flex-shrink-0 mt-0.5">&#183;</span>
                                  <span>{ing}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Instructions */}
                        {r.instructions && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700 mb-1.5">Zubereitung</p>
                            <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.instructions}</p>
                          </div>
                        )}

                        {/* Fallback */}
                        {!hasDetails && (
                          <p className="text-gray-400 text-xs">Keine Details hinterlegt.</p>
                        )}

                      </div>
                    </Collapsible>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </Collapsible>
    </div>
  )
}
