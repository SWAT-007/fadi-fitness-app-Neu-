'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealHistoryEntry } from '@/lib/types'

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toLocalDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayKey()     { return toLocalDateKey(new Date().toISOString()) }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return toLocalDateKey(d.toISOString()) }
function humanLabel(key: string): string {
  if (key === todayKey())     return 'Heute'
  if (key === yesterdayKey()) return 'Gestern'
  const [y, m, day] = key.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function groupByDate(history: MealHistoryEntry[]) {
  const map = new Map<string, MealHistoryEntry[]>()
  for (const entry of history) {
    const key = toLocalDateKey(entry.logged_at)
    const bucket = map.get(key) ?? []
    bucket.push(entry)
    map.set(key, bucket)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ label: humanLabel(key), items }))
}

function formatEntryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function entryMacroSummary(entry: MealHistoryEntry) {
  return entry.ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories ?? 0),
      protein: acc.protein + (ing.protein ?? 0),
      carbs: acc.carbs + (ing.carbs ?? 0),
      fat: acc.fat + (ing.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

// ─── Collapsible ──────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  history: MealHistoryEntry[]
  reusingId: string | null
  onReuse: (entry: MealHistoryEntry) => void
  onDelete: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealHistorySection({ history, reusingId, onReuse, onDelete }: Props) {
  const [sectionOpen, setSectionOpen] = useState(false)
  // Collapsible state per entry id
  const [openIds, setOpenIds]         = useState<Set<string>>(new Set())
  // Which entry is showing the "Wirklich löschen?" prompt
  const [confirmId, setConfirmId]     = useState<string | null>(null)
  // Which entry is currently being deleted (spinner / disabled state)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  if (history.length === 0) return null

  const grouped = groupByDate(history)

  const toggle = (id: string) =>
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setConfirmId(null)
    const { error } = await supabase.from('meal_history').delete().eq('id', id)
    if (!error) onDelete(id)
    setDeletingId(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setSectionOpen(o => !o)}
        className="w-full text-left flex items-center justify-between gap-2 px-5 py-4 hover:bg-gray-50/60 transition-colors"
      >
        <div>
          <h2 className="font-bold text-gray-900">Vorherige Mahlzeiten</h2>
          <p className="text-xs text-gray-400 mt-0.5">{history.length} Einträge</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${sectionOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Collapsible open={sectionOpen}>
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
      {grouped.map(group => (
        <div key={group.label} className="space-y-3 pt-3">
          {/* Date label */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
            {group.label}
          </p>

          {group.items.map(entry => {
            const isOpen    = openIds.has(entry.id)
            const isConfirm = confirmId === entry.id
            const isDeleting = deletingId === entry.id
            const summary = entryMacroSummary(entry)

            return (
              <div
                key={entry.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Card header — always visible, click to expand/collapse */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!isConfirm) toggle(entry.id) }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggle(entry.id) }}
                  className="w-full text-left flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm leading-tight truncate">
                        {entry.meal_name}
                      </p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">{formatEntryTime(entry.logged_at)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 tabular-nums truncate">
                      {Math.round(entry.total_calories ?? summary.calories)} kcal · {Math.round(summary.protein)}P · {Math.round(summary.carbs)}K · {Math.round(summary.fat)}F
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Reuse button */}
                    <button
                      onClick={e => { e.stopPropagation(); onReuse(entry) }}
                      disabled={!!reusingId || isDeleting}
                      className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg transition-colors hover:bg-green-100 disabled:opacity-40 whitespace-nowrap"
                    >
                      {reusingId === entry.id ? '…' : '↺ Wieder verwenden'}
                    </button>

                    {/* Delete button / confirmation inline */}
                    {isConfirm ? (
                      <span
                        className="flex items-center gap-1"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="text-xs text-gray-500 whitespace-nowrap">Löschen?</span>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors"
                        >
                          Ja
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors"
                        >
                          Nein
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmId(entry.id) }}
                        disabled={isDeleting}
                        title="Löschen"
                        className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {isDeleting ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Expand chevron */}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Collapsible ingredient rows */}
                <Collapsible open={isOpen}>
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {entry.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-center justify-between gap-4 px-5 py-2.5">
                        <span className="text-sm text-gray-800 truncate">{ing.name}</span>
                        <div className="flex items-center gap-2.5 text-xs flex-shrink-0">
                          <span className="font-semibold text-gray-600 tabular-nums">{ing.grams}g</span>
                          <span className="text-gray-400 tabular-nums">{ing.calories} kcal</span>
                          <span className="text-blue-500  tabular-nums">{ing.protein}P</span>
                          <span className="text-green-500 tabular-nums">{ing.carbs}K</span>
                          <span className="text-yellow-500 tabular-nums">{ing.fat}F</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Collapsible>
              </div>
            )
          })}
        </div>
      ))}
        </div>
      </Collapsible>
    </div>
  )
}
