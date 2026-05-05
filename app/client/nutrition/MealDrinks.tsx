'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DrinkLog } from '@/lib/types'

// ─── Preset drinks ────────────────────────────────────────────────────────────

const PRESETS = [
  { name: 'Wasser',        kcalPer100: 0  },
  { name: 'Kaffee',        kcalPer100: 2  },
  { name: 'Tee',           kcalPer100: 1  },
  { name: 'Cola Zero',     kcalPer100: 0  },
  { name: 'Protein Shake', kcalPer100: 40 },
  { name: 'Orangensaft',   kcalPer100: 45 },
  { name: 'Milch',         kcalPer100: 61 },
] as const

function autoCalc(presetName: string, ml: number): number {
  const p = PRESETS.find(p => p.name === presetName)
  return p ? Math.round((p.kcalPer100 * ml) / 100) : 0
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
  mealIndex: number      // 0-based index, stored as meal_number in DB
  clientId:  string
  logs:      DrinkLog[]  // all today's drink_logs — component filters by mealIndex
  onAdd:     (log: DrinkLog) => void
  onDelete:  (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealDrinks({ mealIndex, clientId, logs, onAdd, onDelete }: Props) {
  const [enabled,    setEnabled]    = useState(false)
  const [preset,     setPreset]     = useState<string>(PRESETS[0].name)
  const [isCustom,   setIsCustom]   = useState(false)
  const [customName, setCustomName] = useState('')
  const [amount,     setAmount]     = useState('250')
  const [calories,   setCalories]   = useState('0')
  const [saving,     setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filter logs for this meal only
  const mealLogs  = logs.filter(d => d.meal_number === mealIndex)
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
      setCalories(String(autoCalc(val, parseFloat(amount) || 0)))
    }
  }

  const handleAmountChange = (val: string) => {
    setAmount(val)
    if (!isCustom) {
      setCalories(String(autoCalc(preset, parseFloat(val) || 0)))
    }
  }

  const handleAdd = async () => {
    const drinkName = isCustom ? customName.trim() : preset
    if (!drinkName || !clientId) return
    const ml  = Math.round(parseFloat(amount)  || 0)
    const cal = Math.round(parseFloat(calories) || 0)
    if (ml <= 0) return

    setSaving(true)
    const { data, error } = await supabase
      .from('drink_logs')
      .insert({
        client_id:   clientId,
        drink_name:  drinkName,
        calories:    cal,
        meal_number: mealIndex,
      })
      .select()
      .single()

    if (!error && data) {
      onAdd(data as DrinkLog)
      // Reset calories display for preset (keep preset/amount)
      if (!isCustom) setCalories(String(autoCalc(preset, parseFloat(amount) || 0)))
      else { setCustomName(''); setCalories('') }
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await supabase.from('drink_logs').delete().eq('id', id)
    onDelete(id)
    setDeletingId(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="border-t border-gray-100">

      {/* Toggle row — always visible */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">🥤 Getränke</span>
          {totalCal > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">+{totalCal} kcal</span>
          )}
        </div>
        <button
          onClick={() => setEnabled(e => !e)}
          role="switch"
          aria-checked={enabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
            enabled ? 'bg-green-500' : 'bg-gray-200'
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
            <select
              value={preset}
              onChange={e => handlePresetChange(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            >
              {PRESETS.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
              <option value="__custom__">Individuell…</option>
            </select>

            {isCustom && (
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Getränkname"
                className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
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
                className="w-[76px] px-2 py-2 pr-6 border border-gray-200 rounded-xl text-sm text-right focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">ml</span>
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
                className={`w-[76px] px-2 py-2 pr-8 border border-gray-200 rounded-xl text-sm text-right focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
                  !isCustom ? 'bg-gray-50 text-gray-500 cursor-default' : ''
                }`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">kcal</span>
            </div>

            {/* Add button */}
            <button
              onClick={handleAdd}
              disabled={saving || (isCustom && !customName.trim()) || !(parseFloat(amount) > 0)}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? '…' : 'Hinzufügen'}
            </button>
          </div>

          {/* Drink list */}
          {mealLogs.length > 0 && (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {mealLogs.map(log => (
                <li key={log.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="text-sm leading-none flex-shrink-0">🥤</span>
                  <span className="text-xs text-gray-700 flex-1 truncate">{log.drink_name}</span>
                  <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                    {log.calories ?? 0} kcal
                  </span>
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deletingId === log.id}
                    className="text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors disabled:opacity-40"
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
