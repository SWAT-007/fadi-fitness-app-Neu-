'use client'

import { useEffect, useRef, useState } from 'react'
import type { DrinkLog } from '@/lib/types'

// ─── Drink catalog (trainer-managed) ────────────────────────────────────────────

type DrinkCatalogItem = { id: string; name: string; kcalPer100ml: number | null; unit: string | null }

// kcal for the given catalog drink at `ml` (kcal per 100 ml).
function calcKcal(catalog: DrinkCatalogItem[], name: string, ml: number): number {
  const d = catalog.find(x => x.name === name)
  const per100 = d?.kcalPer100ml ?? 0
  return Math.round((per100 * ml) / 100)
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
  mealId:        string                 // NutritionMeal id this drink belongs to
  drinksCatalog: DrinkCatalogItem[]     // trainer-managed catalog (+ "Individuell")
  logs:          Array<DrinkLog & { meal_id?: string | null }>  // today's drink_logs
  onAdd:         (log: DrinkLog & { meal_id: string | null }) => void
  onDelete:      (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealDrinks({ mealId, drinksCatalog, logs, onAdd, onDelete }: Props) {
  const [enabled,    setEnabled]    = useState(false)
  const [preset,     setPreset]     = useState<string>('')
  const [isCustom,   setIsCustom]   = useState(false)
  const [customName, setCustomName] = useState('')
  const [amount,     setAmount]     = useState('250')
  const [calories,   setCalories]   = useState('0')
  const [saving,     setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Custom dark dropdown for the drink preset (native <select> options can't be
  // reliably dark-styled).
  const [presetOpen, setPresetOpen] = useState(false)
  const presetRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Fixed-position anchor so the list escapes the card's overflow-hidden.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  useEffect(() => {
    if (!presetOpen) { setMenuPos(null); return }

    const reposition = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 4
      const desired = 240
      const spaceBelow = window.innerHeight - r.bottom - 8
      const spaceAbove = r.top - 8
      const openUp = spaceBelow < Math.min(desired, 160) && spaceAbove > spaceBelow
      const maxHeight = Math.min(desired, Math.max(120, openUp ? spaceAbove : spaceBelow))
      const top = openUp ? Math.max(8, r.top - gap - maxHeight) : r.bottom + gap
      setMenuPos({ top, left: r.left, width: r.width, maxHeight })
    }
    reposition()

    const onPointerDown = (e: PointerEvent) => {
      if (!presetRef.current?.contains(e.target as Node)) setPresetOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPresetOpen(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', reposition, true)  // capture: also catch ancestor scroll
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [presetOpen])

  // Default the selection to the first catalog drink once it loads.
  useEffect(() => {
    if (!isCustom && !preset && drinksCatalog.length > 0) {
      setPreset(drinksCatalog[0].name)
    }
  }, [drinksCatalog, isCustom, preset])

  // Filter logs for this meal only (by mealId — stays correct after reload)
  const mealLogs  = logs.filter(d => d.meal_id === mealId)
  const totalCal  = mealLogs.reduce((s, d) => s + (d.calories ?? 0), 0)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePresetChange = (val: string) => {
    if (val === '__custom__') {
      setIsCustom(true)
      setPreset('__custom__')
      setCalories('')
    } else {
      setIsCustom(false)
      setPreset(val)
      setCalories(String(calcKcal(drinksCatalog, val, parseFloat(amount) || 0)))
    }
  }

  const handleAmountChange = (val: string) => {
    setAmount(val)
    if (!isCustom) {
      setCalories(String(calcKcal(drinksCatalog, preset, parseFloat(val) || 0)))
    }
  }

  const handleAdd = async () => {
    const drinkName = isCustom ? customName.trim() : preset
    if (!drinkName) return
    const ml  = Math.round(parseFloat(amount)  || 0)
    const cal = Math.round(parseFloat(calories) || 0)
    if (ml <= 0) return

    setSaving(true)
    try {
      const res = await fetch('/api/backend/me/nutrition/drink-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drinkType: drinkName, amountMl: ml, calories: cal, mealId }),
      })
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { drinkLog?: { id: string; clientId: string; drinkType: string | null; amountMl: number | null; loggedAt: string } } | null
        if (data?.drinkLog) {
          onAdd({
            id: data.drinkLog.id,
            client_id: data.drinkLog.clientId,
            drink_name: drinkName,
            calories: cal,
            meal_number: null,
            meal_id: mealId,
            logged_at: data.drinkLog.loggedAt,
          })
          if (!isCustom) setCalories(String(calcKcal(drinksCatalog, preset, parseFloat(amount) || 0)))
          else { setCustomName(''); setCalories('') }
        }
      }
    } catch {
      // silent
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/backend/me/nutrition/drink-logs/${id}`, { method: 'DELETE' })
      if (res.ok) onDelete(id)
    } catch {
      // silent
    }
    setDeletingId(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="border-t border-white/[0.04]">

      {/* Toggle row — always visible */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#797D83]">🥤 Getränke</span>
          {totalCal > 0 && (
            <span className="text-xs text-[#797D83] tabular-nums">+{totalCal} kcal</span>
          )}
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          role="switch"
          aria-checked={enabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
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
      <Collapsible open={enabled}>
        <div className="px-5 pb-4 space-y-2">

          {/* Drink selector row */}
          <div className="flex gap-2">
            <div ref={presetRef} className="relative flex-1 min-w-0">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setPresetOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={presetOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-white/[0.08] bg-white/[0.05] rounded-xl text-[13px] text-[#EDECEA] focus:border-[#A78BFA]/40 focus:outline-none transition"
              >
                <span className="truncate">{isCustom ? 'Individuell…' : (preset || 'Getränk wählen…')}</span>
                <svg className={`w-4 h-4 text-[#797D83] flex-shrink-0 transition-transform ${presetOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {presetOpen && menuPos && (
                <ul
                  role="listbox"
                  style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
                  className="z-50 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#13131a] py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]"
                >
                  {[...drinksCatalog.map(d => d.name), '__custom__'].map(value => {
                    const label = value === '__custom__' ? 'Individuell…' : value
                    const active = value === '__custom__' ? isCustom : (!isCustom && preset === value)
                    return (
                      <li key={value} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onClick={() => { handlePresetChange(value); setPresetOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                            active ? 'bg-[#A78BFA]/15 text-[#A78BFA]' : 'text-[#EDECEA] hover:bg-white/[0.06]'
                          }`}
                        >
                          {label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {isCustom && (
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Getränkname"
                className="flex-1 min-w-0 px-3 py-2 border border-white/[0.1] bg-white/[0.05] rounded-xl text-[13px] text-[#EDECEA] placeholder-[#797D83]/60 focus:border-[#A78BFA]/40 focus:outline-none transition"
              />
            )}
          </div>

          {/* Amount + kcal + button row */}
          <div className="flex gap-2">
            {/* ml input */}
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                min="0"
                placeholder="250"
                className="w-[76px] px-2 py-2 pr-6 border border-white/[0.08] bg-white/[0.05] [color-scheme:dark] text-[#EDECEA] placeholder-[#797D83]/60 rounded-xl text-sm text-right focus:border-[#A78BFA]/40 focus:outline-none transition"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#797D83] pointer-events-none">ml</span>
            </div>

            {/* kcal input — read-only for presets, editable for custom */}
            <div className="relative">
              <input
                type="number"
                value={calories}
                onChange={e => setCalories(e.target.value)}
                min="0"
                placeholder="0"
                readOnly={!isCustom}
                className={`w-[76px] px-2 py-2 pr-8 border border-white/[0.08] bg-white/[0.05] [color-scheme:dark] text-[#EDECEA] placeholder-[#797D83]/60 rounded-xl text-sm text-right focus:border-[#A78BFA]/40 focus:outline-none transition ${
                  !isCustom ? 'bg-white/[0.03] text-[#797D83] cursor-default' : ''
                }`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#797D83] pointer-events-none">kcal</span>
            </div>

            {/* Add button */}
            <button
              onClick={handleAdd}
              disabled={saving || (isCustom && !customName.trim()) || !(parseFloat(amount) > 0)}
              className="flex-1 px-3 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-40 text-[#050504] text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? '…' : 'Hinzufügen'}
            </button>
          </div>

          {/* Drink list */}
          {mealLogs.length > 0 && (
            <ul className="divide-y divide-white/[0.04] border border-white/[0.06] rounded-xl overflow-hidden">
              {mealLogs.map(log => (
                <li key={log.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="text-sm leading-none flex-shrink-0">🥤</span>
                  <span className="text-xs text-[#EDECEA]/90 flex-1 truncate">{log.drink_name}</span>
                  <span className="text-xs text-[#797D83] tabular-nums flex-shrink-0">
                    {log.calories ?? 0} kcal
                  </span>
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="text-[#797D83]/60 hover:text-red-400 flex-shrink-0 transition-colors disabled:opacity-40"
                    title="Entfernen"
                  >
                    {deletingId === log.id ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Collapsible>
    </div>
  )
}
