'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Recipe {
  id: string
  name: string
  description: string | null
  instructions: string | null
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  /** Client's daily calorie target from the assigned nutrition plan */
  targetCalories: number | null
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
      const res = await fetch('/api/backend/nutrition/recipes')
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
          <h2 className="font-bold text-gray-900">Rezeptvorschläge</h2>
          {targetCalories ? (
            <p className="text-xs text-gray-400 mt-0.5">
              Tägliches Kalorienziel: {targetCalories} kcal · {recipes.length} Rezepte
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">{recipes.length} Rezepte verfügbar</p>
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
            placeholder="Rezept suchen…"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
          />

          {/* Cards */}
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Keine Rezepte gefunden.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => {
                const isOpen = openIds.has(r.id)

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
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-snug">{r.name}</p>
                        {r.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{r.description}</p>
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
                      <div className="border-t border-gray-100 px-5 py-4 text-sm">
                        {r.instructions ? (
                          <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{r.instructions}</p>
                        ) : (
                          <p className="text-gray-400 text-xs">Keine Zubereitung hinterlegt.</p>
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
