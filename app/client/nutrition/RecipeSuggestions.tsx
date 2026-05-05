'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  name: string
  amount: string
}

interface Recipe {
  id: string
  name: string
  ingredients: Ingredient[]
  instructions: string
  total_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  servings: number | null
  source_pdf: string
}

interface Props {
  /** Client's daily calorie target from the assigned nutrition plan */
  targetCalories: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Score a recipe by how close it is to a calorie target (lower = better) */
function relevanceScore(recipe: Recipe, target: number): number {
  if (recipe.total_calories == null) return Infinity
  return Math.abs(recipe.total_calories - target)
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
      const { data } = await supabase
        .from('recipes')
        .select('id,name,ingredients,instructions,total_calories,protein_g,carbs_g,fat_g,servings,source_pdf')
        .order('name', { ascending: true })
      setRecipes((data ?? []) as Recipe[])
      setLoading(false)
    }
    load()
  }, [])

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const filtered = recipes
    .filter(r => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        r.name.toLowerCase().includes(q) ||
        r.ingredients.some(i => i.name.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      if (!targetCalories) return a.name.localeCompare(b.name)
      return relevanceScore(a, targetCalories) - relevanceScore(b, targetCalories)
    })

  // Best match within ±25 % of target
  const bestMatches = targetCalories
    ? filtered.filter(r =>
        r.total_calories != null &&
        Math.abs(r.total_calories - targetCalories) / targetCalories < 0.25,
      )
    : []

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
          <h2 className="font-bold text-gray-900">Rezeptvorschläge</h2>
          {targetCalories && (
            <p className="text-xs text-gray-400 mt-0.5">
              Passend zu deinem Ziel von {targetCalories} kcal/Tag
              {bestMatches.length > 0 && ` · ${bestMatches.length} Treffer`}
            </p>
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
            placeholder="Rezept oder Zutat suchen…"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />

          {/* Cards */}
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Keine Rezepte gefunden.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => {
                const isOpen  = openIds.has(r.id)
                const isMatch = targetCalories != null &&
                  r.total_calories != null &&
                  Math.abs(r.total_calories - targetCalories) / targetCalories < 0.25

                return (
                  <div
                    key={r.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                  >
                    {/* Card header — click to expand / collapse */}
                    <button
                      onClick={() => toggle(r.id)}
                      className="w-full text-left flex items-start justify-between gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm leading-snug">{r.name}</p>
                          {isMatch && (
                            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                              ✓ Passt
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 mt-1 text-xs">
                          {r.total_calories != null && (
                            <span className="text-gray-500">{r.total_calories} kcal</span>
                          )}
                          {r.protein_g != null && (
                            <span className="text-blue-500">{r.protein_g}g P</span>
                          )}
                          {r.carbs_g != null && (
                            <span className="text-green-500">{r.carbs_g}g K</span>
                          )}
                          {r.fat_g != null && (
                            <span className="text-yellow-500">{r.fat_g}g F</span>
                          )}
                        </div>
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
                      <div className="border-t border-gray-100 px-5 py-4 space-y-4 text-sm">
                        {/* Ingredients */}
                        {r.ingredients.length > 0 && (
                          <div>
                            <p className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Zutaten</p>
                            <ul className="space-y-1.5">
                              {r.ingredients.map((ing, i) => (
                                <li key={i} className="flex gap-3">
                                  {ing.amount && (
                                    <span className="font-medium text-gray-800 min-w-[64px] flex-shrink-0">
                                      {ing.amount}
                                    </span>
                                  )}
                                  <span className="text-gray-600">{ing.name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Instructions */}
                        {r.instructions && (
                          <div>
                            <p className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Zubereitung</p>
                            <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{r.instructions}</p>
                          </div>
                        )}

                        {r.servings && (
                          <p className="text-xs text-gray-400">Portionen: {r.servings}</p>
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
