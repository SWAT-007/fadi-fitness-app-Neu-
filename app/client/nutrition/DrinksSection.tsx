'use client'

import { useState } from 'react'
import type { DrinkLog } from '@/lib/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  logs: DrinkLog[]
  onAdd: (log: DrinkLog) => void
  onDelete: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DrinksSection({ logs, onAdd, onDelete }: Props) {
  const [enabled,    setEnabled]    = useState(false)
  const [name,       setName]       = useState('')
  const [calories,   setCalories]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error,      setError]      = useState('')

  const totalCal = logs.reduce((s, d) => s + (d.calories ?? 0), 0)

  // ── Add ──────────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/backend/me/nutrition/drink-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drinkType: trimmed, amountMl: null }),
      })
      if (!res.ok) {
        setError('Fehler beim Hinzufügen.')
      } else {
        const data = (await res.json().catch(() => null)) as { drinkLog?: { id: string; clientId: string; drinkType: string | null; amountMl: number | null; loggedAt: string } } | null
        if (data?.drinkLog) {
          onAdd({
            id: data.drinkLog.id,
            client_id: data.drinkLog.clientId,
            drink_name: trimmed,
            calories: calories ? parseInt(calories, 10) : null,
            meal_number: null,
            logged_at: data.drinkLog.loggedAt,
          })
          setName('')
          setCalories('')
        } else {
          setError('Fehler beim Hinzufügen.')
        }
      }
    } catch {
      setError('Fehler beim Hinzufügen.')
    }
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/backend/me/nutrition/drink-logs/${id}`, { method: 'DELETE' })
      if (res.ok) onDelete(id)
    } catch {
      // silent — keep UI state unchanged on network error
    }
    setDeletingId(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">

      {/* Header — always visible */}
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="font-bold text-[#EDECEA]">Getränke</h2>
          {totalCal > 0 && (
            <p className="text-xs text-[#797D83] mt-0.5">{totalCal} kcal heute</p>
          )}
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => setEnabled(e => !e)}
          role="switch"
          aria-checked={enabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
            enabled ? 'bg-[#A78BFA]/100' : 'bg-white/[0.15]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Collapsible body */}
      <div
        className={`transition-all duration-200 ease-in-out ${
          enabled ? 'opacity-100' : 'max-h-0 overflow-hidden opacity-0'
        }`}
      >
        <div className="border-t border-white/[0.04] px-5 pb-5 pt-4 space-y-3">

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Input row */}
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="z.B. Kaffee, Protein Shake, Saft…"
              className="flex-1 min-w-0 px-3 py-2 border border-white/[0.1] rounded-xl text-sm focus:border-[#A78BFA]/40 focus:outline-none transition"
            />
            <div className="relative flex-shrink-0">
              <input
                type="number"
                value={calories}
                onChange={e => setCalories(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                min="0"
                className="w-[72px] px-3 py-2 pr-8 border border-white/[0.1] rounded-xl text-sm text-right focus:border-[#A78BFA]/40 focus:outline-none transition"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#797D83] pointer-events-none">
                kcal
              </span>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-40 text-[#050504] text-sm font-semibold rounded-xl transition-colors flex-shrink-0"
            >
              {saving ? '…' : 'Hinzufügen'}
            </button>
          </div>

          {/* Drink list */}
          {logs.length > 0 && (
            <ul className="divide-y divide-white/[0.04] border border-white/[0.06] rounded-xl overflow-hidden">
              {logs.map(log => (
                <li key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-base leading-none flex-shrink-0">🥤</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[#EDECEA] truncate block">{log.drink_name}</span>
                  </div>
                  {log.calories != null && (
                    <span className="text-xs font-semibold text-[#797D83] tabular-nums flex-shrink-0">
                      {log.calories} kcal
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="text-[#797D83]/60 hover:text-red-400 flex-shrink-0 transition-colors disabled:opacity-40"
                    title="Entfernen"
                  >
                    {deletingId === log.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {logs.length === 0 && (
            <p className="text-xs text-[#797D83] text-center py-2">
              Noch keine Getränke heute eingetragen.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
