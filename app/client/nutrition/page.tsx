'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  calcMacros,
  type ClientMealFood, type Food, type FoodCategory,
  type NutritionGoal, type NutritionMeal, type NutritionPlan,
} from '@/lib/types'
import MealHistorySection from './MealHistorySection'
import RecipeSuggestions from './RecipeSuggestions'
import MealDrinks from './MealDrinks'
import type { MealHistoryEntry, HistoryIngredient, DrinkLog } from '@/lib/types'

type FullPlan = NutritionPlan & { nutrition_meals: NutritionMeal[] }

const GOAL_META: Record<NutritionGoal, { label: string; bg: string }> = {
  cut:      { label: 'Abnehmen',     bg: 'bg-blue-50'   },
  bulk:     { label: 'Muskelaufbau', bg: 'bg-orange-50' },
  maintain: { label: 'Erhaltung',    bg: 'bg-green-50'  },
}

const SLOT_CATS: FoodCategory[] = ['protein', 'carbs', 'fat']
const FREE_CATS: FoodCategory[] = ['vegetable']  // ignoriert in Berechnung
const SLOT_LABEL: Record<FoodCategory, string> = {
  protein: 'Eiweiß', carbs: 'Kohlenhydrate', fat: 'Fett',
  vegetable: 'Gemüse', fruit: 'Obst', dairy: 'Milchprodukt', other: 'Sonstiges',
}
const SLOT_COLOR: Record<FoodCategory, { dot: string; text: string; bar: string }> = {
  protein:   { dot: 'bg-blue-500',   text: 'text-blue-700',   bar: '#3b82f6' },
  carbs:     { dot: 'bg-green-500',  text: 'text-green-700',  bar: '#22c55e' },
  fat:       { dot: 'bg-yellow-500', text: 'text-yellow-700', bar: '#eab308' },
  vegetable: { dot: 'bg-green-400',  text: 'text-green-600',  bar: '#22c55e' },
  fruit:     { dot: 'bg-pink-500',   text: 'text-pink-700',   bar: '#ec4899' },
  dairy:     { dot: 'bg-purple-500', text: 'text-purple-700', bar: '#a855f7' },
  other:     { dot: 'bg-gray-400',   text: 'text-gray-600',   bar: '#9ca3af' },
}

type CmfWithFood = ClientMealFood & { food: Food }

// ─── Lineares Gleichungssystem für Gramm-Berechnung ──────────────────────────

/**
 * Gauss-Elimination für n×n.
 * Gibt null zurück, wenn singulär.
 */
function gaussianSolve(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let i = 0; i < n; i++) {
    let pivot = i
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r
    }
    if (Math.abs(M[pivot][i]) < 1e-9) return null
    if (pivot !== i) { const tmp = M[i]; M[i] = M[pivot]; M[pivot] = tmp }
    for (let r = i + 1; r < n; r++) {
      const factor = M[r][i] / M[i][i]
      for (let c = i; c <= n; c++) M[r][c] -= factor * M[i][c]
    }
  }
  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]
    x[i] = s / M[i][i]
  }
  return x
}

/**
 * Linear Least Squares über Normalform: AᵀA · x = Aᵀb.
 */
function lsq(A: number[][], b: number[]): number[] | null {
  const n = A[0]?.length ?? 0
  if (n === 0) return []
  const At: number[][] = Array.from({ length: n }, (_, i) => A.map(row => row[i]))
  const AtA = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      At[i].reduce((s, _v, r) => s + At[i][r] * At[j][r], 0)
    )
  )
  const Atb = At.map(col => col.reduce((s, v, r) => s + v * b[r], 0))
  return gaussianSolve(AtA, Atb)
}

/**
 * Lineares Least-Squares mit Untergrenze: x_j ≥ minGrams für alle j.
 * Iteratives Pinning — wenn ein Wert die Schranke unterschreitet, wird er
 * fixiert und das Restsystem neu gelöst. Damit bekommt JEDES ausgewählte
 * Lebensmittel mindestens minGrams (z.B. 5g), auch wenn das Ziel dadurch
 * weiter danebenliegt — der Warnhinweis im UI zeigt das.
 */
function constrainedLSQ(A: number[][], b: number[], minGrams = 5): number[] {
  const n = A[0]?.length ?? 0
  const x = Array<number>(n).fill(0)
  const pinned = Array<boolean>(n).fill(false)

  for (let iter = 0; iter < n + 1; iter++) {
    const free: number[] = []
    for (let j = 0; j < n; j++) if (!pinned[j]) free.push(j)
    if (free.length === 0) break

    // b' = b − Σ_{pinned j} A_j · minGrams
    const bReduced = b.map((bi, row) => {
      let s = bi
      for (let j = 0; j < n; j++) if (pinned[j]) s -= A[row][j] * minGrams
      return s
    })
    const Aprime = A.map(row => free.map(j => row[j]))

    const xFree = lsq(Aprime, bReduced)
    if (!xFree) {
      for (const j of free) { pinned[j] = true; x[j] = minGrams }
      continue
    }

    for (let j = 0; j < n; j++) x[j] = pinned[j] ? minGrams : 0
    free.forEach((j, k) => { x[j] = xFree[k] })

    let toPin = -1
    let worst = minGrams
    for (const j of free) {
      if (x[j] < worst) { worst = x[j]; toPin = j }
    }
    if (toPin === -1) break
    pinned[toPin] = true
  }

  for (let j = 0; j < n; j++) if (x[j] < minGrams) x[j] = minGrams
  return x
}

/**
 * Berechnet Gramm pro Lebensmittel so, dass die Ziel-Makros der Mahlzeit
 * möglichst genau getroffen werden, unter der Bedingung Gramm ≥ 0.
 *
 * Gibt Map (food.id → grams) UND Residuum ‖Ax − b‖ zurück. Wenn das Residuum
 * deutlich > 0 ist, kann die Auswahl das Ziel nicht erreichen — der UI-Layer
 * zeigt dann einen Hinweis.
 */
function solveGrams(meal: NutritionMeal, picked: Food[]): { grams: Map<string, number>; residual: number } {
  const grams = new Map<string, number>()
  if (picked.length === 0) return { grams, residual: 0 }

  const targets = [meal.target_protein, meal.target_carbs, meal.target_fat]
  const macroIdxOf = (cat: FoodCategory): number =>
    cat === 'protein' ? 0 : cat === 'carbs' ? 1 : cat === 'fat' ? 2 : -1

  const ordered = [...picked].sort((a, b) => macroIdxOf(a.category) - macroIdxOf(b.category))
  const indices = ordered.map(f => macroIdxOf(f.category)).filter(i => i >= 0)
  const valid = ordered.filter(f => macroIdxOf(f.category) >= 0)
  if (valid.length === 0) return { grams, residual: 0 }

  const macroPer100 = (f: Food, mIdx: number) =>
    mIdx === 0 ? f.protein_per_100g : mIdx === 1 ? f.carbs_per_100g : f.fat_per_100g

  // Bei 1 Slot: simple Division (entspricht NNLS für n=1)
  if (valid.length === 1) {
    const f = valid[0]
    const mIdx = indices[0]
    const per100 = macroPer100(f, mIdx)
    const g = per100 > 0 ? Math.max(0, Math.round(targets[mIdx] / per100 * 100)) : 100
    grams.set(f.id, g)
    // Residuum: andere Ziele werden nicht getroffen
    let sq = 0
    for (let i = 0; i < 3; i++) {
      const got = macroPer100(f, i) * g / 100
      sq += (got - targets[i]) ** 2
    }
    return { grams, residual: Math.sqrt(sq) }
  }

  // Vollsystem über alle 3 Makros — auch wenn nur 2 Slots gewählt sind:
  // so werden Nebenmakros (z.B. Fett im Hähnchen) korrekt berücksichtigt.
  const A: number[][] = []
  const b: number[] = []
  for (let mIdx = 0; mIdx < 3; mIdx++) {
    const row = valid.map(f => macroPer100(f, mIdx) / 100)
    A.push(row)
    b.push(targets[mIdx])
  }

  // Constrained LSQ: jedes Lebensmittel bekommt mindestens 5g.
  const x = constrainedLSQ(A, b, 5)

  // Residuum ‖A·x − b‖ berechnen (für Mismatch-Hinweis im UI).
  let sq = 0
  for (let i = 0; i < 3; i++) {
    const ax = A[i].reduce((s, v, j) => s + v * x[j], 0)
    sq += (ax - b[i]) ** 2
  }
  const residual = Math.sqrt(sq)

  valid.forEach((f, i) => grams.set(f.id, Math.max(5, Math.round(x[i]))))
  return { grams, residual }
}

function macrosFor(cmf: CmfWithFood) {
  return calcMacros(cmf.food, cmf.amount_g)
}
const isFreeCat = (cat: FoodCategory) => FREE_CATS.includes(cat)
/** Summiert nur nicht-„Free" Lebensmittel (Gemüse zählt nicht in Bilanz). */
function sumMacros(items: CmfWithFood[]) {
  return items.reduce((a, c) => {
    if (isFreeCat(c.food.category)) return a
    const m = macrosFor(c)
    return { cal: a.cal + m.calories, p: a.p + m.protein, k: a.k + m.carbs, f: a.f + m.fat }
  }, { cal: 0, p: 0, k: 0, f: 0 })
}

// ─── Collapsible ──────────────────────────────────────────────────────────────

function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    // measure immediately
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

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'info' | 'error'; message: string }

// ─── UI helpers ──────────────────────────────────────────────────────────────

function CalorieRing({ current, target }: { current: number; target: number }) {
  const r = 50
  const circ = 2 * Math.PI * r
  const pct = Math.min(1, current / Math.max(target, 1))
  const dash = pct * circ
  const over = current > target ? current - target : 0

  // Count-up animation
  const prevRef = useRef(current)
  const [displayVal, setDisplayVal] = useState(Math.round(current))
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = current
    prevRef.current = current

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (from === to) { setDisplayVal(Math.round(to)); return }

    const duration = 400
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      setDisplayVal(Math.round(from + (to - from) * progress))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [current])

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={over > 0 ? '#ef4444' : '#22c55e'}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 400ms ease-out, stroke 300ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900">{displayVal}</span>
        <span className="text-[10px] text-gray-500">/ {target} kcal</span>
      </div>
    </div>
  )
}

function MiniBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const over = target > 0 && current > target
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: over ? '#ef4444' : color,
          transition: 'width 400ms ease-out',
        }}
      />
    </div>
  )
}

// ─── Slot-Picker ──────────────────────────────────────────────────────────────

function SlotPicker({
  category, foods, onPick,
}: {
  category: FoodCategory
  foods: Food[]
  onPick: (food: Food) => void
}) {
  const list = foods
    .filter(f => f.category === category)

  const handlePick = (food: Food) => {
    onPick(food)
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 p-2">
      {list.length > 0 ? (
        <ul className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm max-h-64 overflow-y-auto">
          {list.map(f => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => handlePick(f)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-green-50 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{f.name}</div>
                  <div className="text-[10px] text-gray-400">
                    {f.kcal_per_100g} kcal · {f.protein_per_100g}P {f.carbs_per_100g}K {f.fat_per_100g}F / 100g
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 px-1 py-2">Nichts gefunden.</p>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientNutritionPage() {
  const [plan, setPlan] = useState<FullPlan | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [foods, setFoods] = useState<Food[]>([])
  const [cmf, setCmf] = useState<CmfWithFood[]>([])
  const [openPicker, setOpenPicker] = useState<{ mealId: string; cat: FoodCategory } | null>(null)
  const [loading, setLoading] = useState(true)

  // Drink logs (today only)
  const [drinkLogs, setDrinkLogs] = useState<DrinkLog[]>([])

  // Meal history state
  const [mealHistory, setMealHistory]       = useState<MealHistoryEntry[]>([])
  const [savedMealIds, setSavedMealIds]     = useState<Set<string>>(new Set())
  const [savingHistoryId, setSavingHistoryId] = useState<string | null>(null)
  const [reusingHistoryId, setReusingHistoryId] = useState<string | null>(null)

  // Custom name input per meal (before saving to history)
  const [customMealNames, setCustomMealNames] = useState<Record<string, string>>({})

  // Extra (Zusatz) food slots — picked from the same food DB, grams set by user
  // { [mealId]: { protein?: { food, grams }, carbs?: ..., fat?: ... } }
  interface ExtraSlot { food: Food; grams: string }
  type ExtraSlotMap = Record<string, Partial<Record<FoodCategory, ExtraSlot>>>
  const [extraSlots, setExtraSlots] = useState<ExtraSlotMap>({})

  // Separate picker state for the Zusatz row (avoids conflicting with main openPicker)
  const [openExtraPicker, setOpenExtraPicker] = useState<{ mealId: string; cat: FoodCategory } | null>(null)

  // ── Save button flash ──
  const [saveFlash, setSaveFlash] = useState<Set<string>>(new Set())

  // ── Macro met flash ──
  const prevMacroRef = useRef<Map<string, boolean>>(new Map())
  const [macroMet, setMacroMet] = useState<Set<string>>(new Set())

  // ── Toast system ──
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
  }, [])

  const setExtraSlot = (mealId: string, cat: FoodCategory, val: ExtraSlot | null) =>
    setExtraSlots(prev => {
      const m = { ...(prev[mealId] ?? {}) }
      if (val === null) delete m[cat]
      else m[cat] = val
      return { ...prev, [mealId]: m }
    })

  // Returns the MACRO grams contributed by the extra slot (not weight grams)
  const getExtraG = (mealId: string, cat: FoodCategory): number => {
    const slot = extraSlots[mealId]?.[cat]
    if (!slot) return 0
    const g = Math.max(0, parseFloat(slot.grams) || 0)
    const m = calcMacros(slot.food, g)
    return cat === 'protein' ? m.protein : cat === 'carbs' ? m.carbs : m.fat
  }

  // Collapsible state — Set of open meal IDs (plan meals + history entries)
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())
  const toggleCard = (id: string) =>
    setOpenCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: client } = await supabase
      .from('clients').select('id, user_id').eq('user_id', user.id).maybeSingle()
    if (!client) { setLoading(false); return }
    setClientId(client.id)
    setUserId(user.id)

    // Load meal history
    const { data: historyData } = await supabase
      .from('meal_history')
      .select('*')
      .eq('client_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(50)
    setMealHistory((historyData ?? []) as MealHistoryEntry[])

    const { data: anp } = await supabase
      .from('assigned_nutrition_plans')
      .select('plan_id, is_active, assigned_at')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!anp) { setLoading(false); return }

    const { data: planData } = await supabase
      .from('nutrition_plans')
      .select('*, nutrition_meals(*)')
      .eq('id', anp.plan_id)
      .single()
    if (!planData) { setLoading(false); return }

    const sorted = {
      ...planData,
      nutrition_meals: [...(planData.nutrition_meals ?? [])]
        .sort((a: NutritionMeal, b: NutritionMeal) => a.sort_order - b.sort_order),
    } as FullPlan
    setPlan(sorted)

    const { data: foodsData } = await supabase.from('foods').select('*').order('name')
    setFoods(foodsData ?? [])

    // Nur heutiger Tag — ab Mitternacht (lokale Zeit in UTC umgerechnet)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const mealIds = sorted.nutrition_meals.map(m => m.id)
    if (mealIds.length > 0) {
      const { data: cmfData } = await supabase
        .from('client_meal_foods')
        .select('*, food:foods(*)')
        .eq('client_id', client.id)
        .in('meal_id', mealIds)
        .gte('created_at', todayStart.toISOString())
      setCmf((cmfData ?? []) as CmfWithFood[])
    }

    // Load today's drink logs
    const { data: drinkData } = await supabase
      .from('drink_logs')
      .select('*')
      .eq('client_id', user.id)
      .gte('logged_at', todayStart.toISOString())
      .order('logged_at', { ascending: true })
    setDrinkLogs((drinkData ?? []) as DrinkLog[])

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Slot pick: ersetzt Wahl in derselben Kategorie. Setzt amount_g=0 ("noch
  //     nicht berechnet") und resettet auch andere Slots dieser Mahlzeit auf 0,
  //     damit Kunde am Ende „Berechnen" klickt. ────────────────────────────

  const pickSlot = async (mealId: string, food: Food) => {
    if (!clientId || !plan) return
    const meal = plan.nutrition_meals.find(m => m.id === mealId)
    if (!meal) return
    const isFree = isFreeCat(food.category)

    const oldOfSameCat = cmf.filter(c => c.meal_id === mealId && c.food.category === food.category)
    if (oldOfSameCat.length > 0) {
      await supabase.from('client_meal_foods').delete().in('id', oldOfSameCat.map(c => c.id))
    }

    // Bei Makro-Slot: andere Makro-Slots zurücksetzen, damit neu berechnet wird.
    // Free-Slot (Gemüse) ändert NICHT die Makro-Slots.
    if (!isFree) {
      const otherMacroSlots = cmf.filter(c =>
        c.meal_id === mealId &&
        c.food.category !== food.category &&
        !isFreeCat(c.food.category)
      )
      if (otherMacroSlots.length > 0) {
        await Promise.all(otherMacroSlots.map(s =>
          supabase.from('client_meal_foods').update({ amount_g: 0 }).eq('id', s.id)
        ))
      }
    }

    // Gemüse bekommt sofort die Trainer-Vorgabe; Makro-Slots erst nach Berechnen.
    const vegGrams = Math.max(0, Math.round(meal.target_vegetable_g ?? 0))
    const insertPayload = {
      client_id: clientId, meal_id: mealId, food_id: food.id,
      amount_g: isFree ? vegGrams : 0,
      sort_order: isFree ? 99 : SLOT_CATS.indexOf(food.category),
    }
    const { data: inserted, error: insErr } = await supabase
      .from('client_meal_foods')
      .insert(insertPayload)
      .select('*, food:foods(*)')
      .single()
    if (insErr) {
      console.error('[cmf insert]', insErr)
      return
    }

    setCmf(prev => {
      const filtered = prev.filter(c => !(c.meal_id === mealId && c.food.category === food.category))
      const updated = filtered.map(c => {
        if (c.meal_id !== mealId) return c
        if (isFree) return c                        // Free-Pick ändert nichts am Rest
        if (isFreeCat(c.food.category)) return c    // Makro-Pick lässt Free-Slots in Ruhe
        return { ...c, amount_g: 0 }
      })
      return [...updated, inserted as CmfWithFood]
    })
    setOpenPicker(null)
  }

  const clearSlot = async (mealId: string, cat: FoodCategory) => {
    const items = cmf.filter(c => c.meal_id === mealId && c.food.category === cat)
    if (items.length === 0) return
    const isFree = isFreeCat(cat)
    await supabase.from('client_meal_foods').delete().in('id', items.map(c => c.id))

    // Bei Makro-Slot: verbleibende Makro-Slots zurücksetzen.
    // Bei Free-Slot: nichts ändern.
    if (!isFree) {
      const remainingMacro = cmf.filter(c =>
        c.meal_id === mealId &&
        c.food.category !== cat &&
        !isFreeCat(c.food.category)
      )
      if (remainingMacro.length > 0) {
        await Promise.all(remainingMacro.map(c =>
          supabase.from('client_meal_foods').update({ amount_g: 0 }).eq('id', c.id)
        ))
      }
    }

    setCmf(prev => prev
      .filter(c => !(c.meal_id === mealId && c.food.category === cat))
      .map(c => {
        if (c.meal_id !== mealId) return c
        if (isFree) return c
        if (isFreeCat(c.food.category)) return c
        return { ...c, amount_g: 0 }
      })
    )
  }

  // ─── „Berechnen": löst NNLS für alle Slots einer Mahlzeit ────────────────

  const calcMeal = async (mealId: string) => {
    if (!plan) return
    const meal = plan.nutrition_meals.find(m => m.id === mealId)
    if (!meal) return
    const items = cmf.filter(c => c.meal_id === mealId)
    if (items.length === 0) return

    // Makro-Slots werden über NNLS gelöst, Free-Slots (Gemüse) bekommen den
    // vom Trainer festgelegten Wert (target_vegetable_g).
    // Extra-Quellen (manuell eingetragen) werden vorab von den Zielen abgezogen.
    const adjustedMeal = {
      ...meal,
      target_protein: Math.max(0, meal.target_protein - getExtraG(mealId, 'protein')),
      target_carbs:   Math.max(0, meal.target_carbs   - getExtraG(mealId, 'carbs')),
      target_fat:     Math.max(0, meal.target_fat     - getExtraG(mealId, 'fat')),
    }
    const macroFoods = items.filter(c => !isFreeCat(c.food.category)).map(c => c.food)
    const { grams } = solveGrams(adjustedMeal, macroFoods)
    const vegGrams = Math.max(0, Math.round(meal.target_vegetable_g ?? 0))

    const updates = items.map(c => ({
      id: c.id,
      amount_g: isFreeCat(c.food.category) ? vegGrams : (grams.get(c.food.id) ?? c.amount_g),
    }))

    await Promise.all(updates.map(u =>
      supabase.from('client_meal_foods').update({ amount_g: u.amount_g }).eq('id', u.id)
    ))

    const idToGrams = new Map(updates.map(u => [u.id, u.amount_g]))
    setCmf(prev => prev.map(c =>
      idToGrams.has(c.id) ? { ...c, amount_g: idToGrams.get(c.id)! } : c
    ))
  }

  // ─── Meal History: save ───────────────────────────────────────────────────

  const saveMealToHistory = async (mealId: string) => {
    if (!userId || !plan) return
    const meal = plan.nutrition_meals.find(m => m.id === mealId)
    if (!meal) return

    const mealItems = cmf.filter(c => c.meal_id === mealId && c.amount_g > 0)
    if (mealItems.length === 0) return

    setSavingHistoryId(mealId)

    // Use custom name if provided, else fall back to the plan meal name
    const customName = customMealNames[mealId]?.trim()
    const mealName = customName || meal.name

    const ingredients: HistoryIngredient[] = mealItems.map(item => {
      const m = macrosFor(item)
      return {
        food_id:  item.food_id,
        category: item.food.category,
        name:     item.food.name,
        grams:    Math.round(item.amount_g),
        calories: Math.round(m.calories),
        protein:  Math.round(m.protein),
        carbs:    Math.round(m.carbs),
        fat:      Math.round(m.fat),
      }
    })

    // Append extra (Zusatz) food slots to the ingredients list
    const mealExtraSlots = extraSlots[mealId] ?? {}
    for (const [cat, slot] of Object.entries(mealExtraSlots) as [FoodCategory, ExtraSlot][]) {
      if (!slot) continue
      const g = Math.round(Math.max(0, parseFloat(slot.grams) || 0))
      if (g <= 0) continue
      const em = calcMacros(slot.food, g)
      ingredients.push({
        food_id:  slot.food.id,
        category: cat,
        name:     slot.food.name + ' (Zusatz)',
        grams:    g,
        calories: Math.round(em.calories),
        protein:  Math.round(em.protein),
        carbs:    Math.round(em.carbs),
        fat:      Math.round(em.fat),
      })
    }

    const { data } = await supabase
      .from('meal_history')
      .insert({
        client_id:      userId,
        meal_name:      mealName,
        ingredients,
        total_calories: ingredients.reduce((s, i) => s + i.calories, 0),
      })
      .select()
      .single()

    if (data) {
      setMealHistory(prev => [data as MealHistoryEntry, ...prev])
      setSavedMealIds(prev => new Set([...prev, mealId]))
      // Clear custom name after successful save
      setCustomMealNames(prev => { const n = { ...prev }; delete n[mealId]; return n })
      // Save flash feedback
      setSaveFlash(prev => new Set([...prev, mealId]))
      setTimeout(() => setSaveFlash(prev => {
        const next = new Set(prev); next.delete(mealId); return next
      }), 1500)
      showToast('success', 'Mahlzeit gespeichert ✓')
    }
    setSavingHistoryId(null)
  }

  // ─── Meal History: reuse ──────────────────────────────────────────────────

  const reuseFromHistory = async (entry: MealHistoryEntry) => {
    if (!clientId || !plan) return

    // Match by meal name (case-insensitive), fall back to first meal
    const targetMeal =
      plan.nutrition_meals.find(m => m.name.toLowerCase() === entry.meal_name.toLowerCase()) ??
      plan.nutrition_meals[0]
    if (!targetMeal) return

    setReusingHistoryId(entry.id)

    // Clear existing slots for that meal
    const existing = cmf.filter(c => c.meal_id === targetMeal.id)
    if (existing.length > 0) {
      await supabase.from('client_meal_foods').delete().in('id', existing.map(c => c.id))
    }

    // Re-insert from history
    const payloads = entry.ingredients.map((ing, i) => ({
      client_id: clientId,
      meal_id:   targetMeal.id,
      food_id:   ing.food_id,
      amount_g:  ing.grams,
      sort_order: SLOT_CATS.indexOf(ing.category as FoodCategory) !== -1
        ? SLOT_CATS.indexOf(ing.category as FoodCategory)
        : i,
    }))

    const { data: inserted } = await supabase
      .from('client_meal_foods')
      .insert(payloads)
      .select('*, food:foods(*)')

    if (inserted) {
      setCmf(prev => [
        ...prev.filter(c => c.meal_id !== targetMeal.id),
        ...(inserted as CmfWithFood[]),
      ])
      showToast('info', 'Mahlzeit übernommen. Getränke ggf. neu eintragen und bei Bedarf Mengen berechnen.')
    }

    setReusingHistoryId(null)
  }

  // ─── Macro met tracking ───────────────────────────────────────────────────

  // Check macro crossings after cmf changes
  useEffect(() => {
    if (!plan) return
    const newlyMet: string[] = []
    for (const meal of plan.nutrition_meals) {
      const items = cmf.filter(c => c.meal_id === meal.id)
      const t = sumMacros(items)
      const pairs: [string, number, number][] = [
        [`${meal.id}-protein`, t.p, meal.target_protein],
        [`${meal.id}-carbs`,   t.k, meal.target_carbs],
        [`${meal.id}-fat`,     t.f, meal.target_fat],
      ]
      for (const [key, cur, tgt] of pairs) {
        const wasMet = prevMacroRef.current.get(key) ?? false
        const isMet  = tgt > 0 && cur >= tgt
        if (!wasMet && isMet) newlyMet.push(key)
        prevMacroRef.current.set(key, isMet)
      }
    }
    if (newlyMet.length > 0) {
      setMacroMet(prev => {
        const next = new Set(prev)
        for (const k of newlyMet) next.add(k)
        return next
      })
      const timer = setTimeout(() => {
        setMacroMet(prev => {
          const next = new Set(prev)
          for (const k of newlyMet) next.delete(k)
          return next
        })
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [cmf, plan])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const dayTotals = useMemo(() => {
    const base = sumMacros(cmf)
    let ep = 0, ek = 0, ef = 0, ecal = 0
    for (const cats of Object.values(extraSlots)) {
      for (const slot of Object.values(cats)) {
        if (!slot) continue
        const g = Math.max(0, parseFloat(slot.grams) || 0)
        const m = calcMacros(slot.food, g)
        ep += m.protein; ek += m.carbs; ef += m.fat; ecal += m.calories
      }
    }
    // Add today's drink calories to the daily total
    const drinkCal = drinkLogs.reduce((s, d) => s + Number(d.calories ?? 0), 0)
    return { p: base.p + ep, k: base.k + ek, f: base.f + ef, cal: base.cal + ecal + drinkCal }
  }, [cmf, extraSlots, drinkLogs])
  const slotsByMeal = useMemo(() => {
    const map: Record<string, Partial<Record<FoodCategory, CmfWithFood>>> = {}
    for (const c of cmf) {
      if (!map[c.meal_id]) map[c.meal_id] = {}
      map[c.meal_id][c.food.category] = c
    }
    return map
  }, [cmf])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>

  if (!plan) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-gray-600">Kein aktiver Ernährungsplan.</p>
          <p className="text-xs text-gray-400 mt-2">Sobald dein Trainer dir einen Plan zugewiesen hat, erscheint er hier.</p>
        </div>
      </div>
    )
  }

  const goalMeta = GOAL_META[plan.goal]

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* ─── Header: Plan + Tagesübersicht ───────────────────────────────── */}
      <div className={`${goalMeta.bg} rounded-3xl p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{goalMeta.label}</p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">{plan.name}</h1>
          </div>
          <CalorieRing current={dayTotals.cal} target={plan.target_calories} />
        </div>

        {/* Drei kompakte Makro-Zeilen */}
        <div className="mt-4 space-y-2">
          {[
            { l: 'Eiweiß',        cur: dayTotals.p, tgt: plan.target_protein, color: '#3b82f6' },
            { l: 'Kohlenhydrate', cur: dayTotals.k, tgt: plan.target_carbs,   color: '#22c55e' },
            { l: 'Fett',          cur: dayTotals.f, tgt: plan.target_fat,     color: '#eab308' },
          ].map(m => (
            <div key={m.l}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 font-medium">{m.l}</span>
                <span className="text-gray-500"><b className="text-gray-900">{Math.round(m.cur)}</b> / {m.tgt}g</span>
              </div>
              <MiniBar current={m.cur} target={m.tgt} color={m.color} />
            </div>
          ))}
        </div>
      </div>

      {/* ─── Mahlzeiten ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {plan.nutrition_meals.map((meal, i) => {
          const slots = slotsByMeal[meal.id] ?? {}
          const items = SLOT_CATS.map(c => slots[c]).filter(Boolean) as CmfWithFood[]
          const t = sumMacros(items)
          // Fall back to all three macros if allowed_categories is null, undefined, OR an empty array
          const allowedRaw = (
            meal.allowed_categories && meal.allowed_categories.length > 0
              ? meal.allowed_categories
              : ['protein', 'carbs', 'fat']
          ) as FoodCategory[]
          const allowed = SLOT_CATS.filter(c => allowedRaw.includes(c))
          const allowedFree = FREE_CATS.filter(c => allowedRaw.includes(c))
          const targetKcal = meal.target_kcal || (meal.target_protein*4 + meal.target_carbs*4 + meal.target_fat*9)
          const pickerCat = openPicker?.mealId === meal.id ? openPicker.cat : null

          // Include extra slot real macro values in per-meal totals
          const mealExtra = extraSlots[meal.id] ?? {}
          let mEP = 0, mEK = 0, mEF = 0, mECal = 0
          for (const slot of Object.values(mealExtra)) {
            if (!slot) continue
            const g = Math.max(0, parseFloat(slot.grams) || 0)
            const em = calcMacros(slot.food, g)
            mEP += em.protein; mEK += em.carbs; mEF += em.fat; mECal += em.calories
          }
          // Add this meal's drink calories to the per-meal total
          const mealDrinkCal = drinkLogs
            .filter(d => d.meal_number === i)
            .reduce((s, d) => s + Number(d.calories ?? 0), 0)
          const tAdj = { p: t.p + mEP, k: t.k + mEK, f: t.f + mEF, cal: t.cal + mECal + mealDrinkCal }

          const macroLines = [
            { cat: 'protein' as FoodCategory, cur: tAdj.p, tgt: meal.target_protein },
            { cat: 'carbs'   as FoodCategory, cur: tAdj.k, tgt: meal.target_carbs   },
            { cat: 'fat'     as FoodCategory, cur: tAdj.f, tgt: meal.target_fat     },
          ].filter(m => allowed.includes(m.cat))

          const allCalculated = items.length > 0 && items.every(it => (it.amount_g ?? 0) > 0)

          const isOpen = openCards.has(meal.id)
          const isFlashing = saveFlash.has(meal.id)

          return (
            <div key={meal.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Mahlzeit-Header — always visible, click to expand/collapse */}
              <button
                onClick={() => toggleCard(meal.id)}
                className="w-full text-left px-5 pt-4 pb-3 border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    <span className="text-gray-400 text-sm font-medium mr-2">#{i + 1}</span>
                    {meal.name}
                  </h2>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      <b className="text-gray-900">{Math.round(tAdj.cal)}</b> / {targetKcal} kcal
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {macroLines.map(m => {
                    const diff = m.tgt - m.cur
                    const over = diff < 0
                    const metKey = `${meal.id}-${m.cat}`
                    return (
                      <div key={m.cat}>
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${SLOT_COLOR[m.cat].dot}`} />
                          <span>{SLOT_LABEL[m.cat]}</span>
                          {macroMet.has(metKey) && (
                            <span className="text-[9px] text-green-600 ml-0.5 animate-pulse">✓</span>
                          )}
                          <span className="ml-auto">
                            <b className="text-gray-900">{Math.round(m.cur)}</b>/{m.tgt}g
                          </span>
                        </div>
                        <MiniBar current={m.cur} target={m.tgt} color={SLOT_COLOR[m.cat].bar} />
                        <p className={`text-[9px] mt-0.5 ${over ? 'text-red-500' : 'text-gray-400'}`}>
                          {over ? `+${Math.abs(Math.round(diff))} über` : diff > 0 ? `${Math.round(diff)} offen` : '✓'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </button>

              {/* Collapsible body */}
              <Collapsible open={isOpen}>

              {/* Makro-Slots */}
              <div className="divide-y divide-gray-50">
                {allowed.map((cat, idx) => {
                  const picked = slots[cat]
                  const c = SLOT_COLOR[cat]
                  const calculated = picked ? picked.amount_g > 0 : false
                  const m = calculated && picked ? macrosFor(picked) : null
                  return (
                    <div key={cat}>
                      {!picked ? (
                        <button
                          onClick={() =>
                            pickerCat === cat
                              ? setOpenPicker(null)
                              : setOpenPicker({ mealId: meal.id, cat })
                          }
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-green-50/40 text-left transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                          <span className="text-sm text-gray-400 flex-1">{SLOT_LABEL[cat]}quelle wählen…</span>
                          <span className="text-green-600 text-sm font-medium">{pickerCat === cat ? '−' : '+'}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 px-5 py-3">
                          <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{picked.food.name}</div>
                            {calculated && m ? (
                              <div className="text-[10px] text-gray-400">
                                <b className="text-gray-700">{Math.round(picked.amount_g)} g</b>
                                <span className="mx-1">·</span>
                                {Math.round(m.calories)} kcal · {Math.round(m.protein)}P {Math.round(m.carbs)}K {Math.round(m.fat)}F
                              </div>
                            ) : (
                              <div className="text-[10px] text-gray-400">
                                {picked.food.kcal_per_100g} kcal · {picked.food.protein_per_100g}P {picked.food.carbs_per_100g}K {picked.food.fat_per_100g}F <span className="text-gray-300">/ 100g</span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setOpenPicker({ mealId: meal.id, cat })}
                            className="text-[11px] text-gray-500 hover:text-gray-700 underline flex-shrink-0"
                          >
                            Ändern
                          </button>
                          <button
                            onClick={() => clearSlot(meal.id, cat)}
                            className="text-gray-300 hover:text-red-500 flex-shrink-0"
                            title="Entfernen"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {/* Picker appears inline, directly under this row */}
                      {pickerCat === cat && (
                        <SlotPicker
                          category={cat}
                          foods={foods}
                          onPick={(food) => pickSlot(meal.id, food)}
                        />
                      )}

                      {/* ── Zusatzquelle row ── */}
                      {idx === 0 && <div className="px-5 py-1 bg-gray-50/70 border-t border-dashed border-gray-100" />}
                      {(() => {
                        const extraSlot = extraSlots[meal.id]?.[cat]
                        const extraPickerOpen = openExtraPicker?.mealId === meal.id && openExtraPicker?.cat === cat

                        if (!extraSlot) {
                          return (
                            <>
                              <button
                                onClick={() =>
                                  extraPickerOpen
                                    ? setOpenExtraPicker(null)
                                    : setOpenExtraPicker({ mealId: meal.id, cat })
                                }
                                className="w-full flex items-center gap-3 pl-8 pr-5 py-2 hover:bg-gray-50/60 text-left transition-colors border-t border-dashed border-gray-100"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dot} opacity-30`} />
                                <span className="text-xs italic text-gray-400 flex-1">Zusatzquelle wählen…</span>
                                <span className="text-gray-400 text-xs font-medium">{extraPickerOpen ? '−' : '+'}</span>
                              </button>
                              {extraPickerOpen && (
                                <SlotPicker
                                  category={cat}
                                  foods={foods}
                                  onPick={food => {
                                    setExtraSlot(meal.id, cat, { food, grams: '30' })
                                    setOpenExtraPicker(null)
                                  }}
                                />
                              )}
                            </>
                          )
                        }

                        const extraG = Math.max(0, parseFloat(extraSlot.grams) || 0)
                        const extraM = calcMacros(extraSlot.food, extraG)
                        return (
                          <>
                            <div className={`flex items-center gap-3 pl-8 pr-5 py-2.5 border-t border-dashed border-gray-100 border-l-2 ${c.dot.replace('bg-', 'border-l-')} border-l-opacity-40`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot} opacity-30 flex-shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-600 italic truncate">{extraSlot.food.name}</div>
                                {extraG > 0 && (
                                  <div className="text-[10px] text-gray-400 mt-0.5">
                                    <b className="text-gray-600 not-italic">{extraG} g</b>
                                    <span className="mx-1">·</span>
                                    {Math.round(extraM.calories)} kcal · {Math.round(extraM.protein)}P {Math.round(extraM.carbs)}K {Math.round(extraM.fat)}F
                                  </div>
                                )}
                              </div>
                              <div className="relative flex-shrink-0">
                                <input
                                  type="number"
                                  value={extraSlot.grams}
                                  onChange={e => setExtraSlot(meal.id, cat, { ...extraSlot, grams: e.target.value })}
                                  min="0"
                                  className="w-16 px-2 py-1 pr-5 text-xs border border-gray-200 rounded-lg bg-white focus:ring-1 focus:ring-green-500 focus:border-transparent text-right"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">g</span>
                              </div>
                              <button
                                onClick={() =>
                                  extraPickerOpen
                                    ? setOpenExtraPicker(null)
                                    : setOpenExtraPicker({ mealId: meal.id, cat })
                                }
                                className="text-[11px] text-gray-500 hover:text-gray-700 underline flex-shrink-0"
                              >
                                Ändern
                              </button>
                              <button
                                onClick={() => setExtraSlot(meal.id, cat, null)}
                                className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
                                title="Entfernen"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            {extraPickerOpen && (
                              <SlotPicker
                                category={cat}
                                foods={foods}
                                onPick={food => {
                                  setExtraSlot(meal.id, cat, { food, grams: extraSlot.grams })
                                  setOpenExtraPicker(null)
                                }}
                              />
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>

              {/* Gemüse-Slot — Gramm vom Trainer vorgegeben, sichtbar nach „Berechnen" */}
              {allowedFree.length > 0 && (
                <div className="divide-y divide-gray-50 border-t border-gray-50 bg-green-50/20">
                  {allowedFree.map(cat => {
                    const picked = slots[cat]
                    const c = SLOT_COLOR[cat]
                    const trainerG = Math.max(0, Math.round(meal.target_vegetable_g ?? 0))
                    return (
                      <div key={cat}>
                        {!picked ? (
                          <button
                            onClick={() => setOpenPicker({ mealId: meal.id, cat })}
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-green-100/40 text-left transition-colors"
                          >
                            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                            <span className="text-sm text-gray-500 flex-1">
                              {SLOT_LABEL[cat]} wählen
                              {trainerG > 0 && <span className="ml-1.5 text-[10px] text-gray-400">({trainerG}g vom Trainer)</span>}
                            </span>
                            <span className="text-green-600 text-sm font-medium">+</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-3">
                            <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{picked.food.name}</div>
                              <div className="text-[10px] text-gray-400">
                                <b className="text-gray-700">{trainerG} g</b>
                                <span className="ml-1 text-gray-300">vom Trainer festgelegt</span>
                              </div>
                            </div>
                            <button
                              onClick={() => setOpenPicker({ mealId: meal.id, cat })}
                              className="text-[11px] text-gray-500 hover:text-gray-700 underline flex-shrink-0"
                            >
                              Ändern
                            </button>
                            <button
                              onClick={() => clearSlot(meal.id, cat)}
                              className="text-gray-300 hover:text-red-500 flex-shrink-0"
                              title="Entfernen"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                        {/* Picker appears inline, directly under this row */}
                        {pickerCat === cat && (
                          <SlotPicker
                            category={cat}
                            foods={foods}
                            onPick={(food) => pickSlot(meal.id, food)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* „Berechnen" — sichtbar wenn alle Makro-Slots gefüllt sind und irgendetwas uncalc ist (auch Gemüse) */}
              {(() => {
                const filledCount = allowed.filter(cat => slots[cat]).length
                const allMacroFilled = filledCount === allowed.length && allowed.length > 0
                const macroItems = allowed.map(c => slots[c]).filter(Boolean) as CmfWithFood[]
                const allMealItems = [
                  ...macroItems,
                  ...allowedFree.map(c => slots[c]).filter(Boolean) as CmfWithFood[],
                ]
                // Treat null the same as 0 — both mean "not yet calculated"
                const anyUncalc = allMealItems.some(it => !(it.amount_g ?? 0))
                if (allMacroFilled && anyUncalc) {
                  return (
                    <div className="px-5 py-3 bg-green-50/50 border-t border-green-100">
                      <button
                        onClick={() => calcMeal(meal.id)}
                        className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        Mengen berechnen
                      </button>
                      <p className="text-[10px] text-center text-gray-500 mt-1.5">Zielwerte werden mit Zusatz neu verrechnet.</p>
                    </div>
                  )
                }
                return null
              })()}

              {/* ── Getränke ─────────────────────────────────────────────────── */}
              {userId && (
                <MealDrinks
                  mealIndex={i}
                  clientId={userId}
                  logs={drinkLogs}
                  onAdd={log => { setDrinkLogs(prev => [...prev, log]); showToast('info', 'Getränk hinzugefügt ✓') }}
                  onDelete={id => setDrinkLogs(prev => prev.filter(d => d.id !== id))}
                />
              )}

              {/* ── Mahlzeit speichern (erscheint wenn alle Mengen berechnet) ── */}
              {allCalculated && (
                <div className="px-5 py-3 border-t border-gray-100 space-y-2">
                  {savedMealIds.has(meal.id) && !isFlashing ? (
                    <p className="text-xs text-center text-green-600 font-semibold py-1">
                      ✓ Mahlzeit gespeichert
                    </p>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={customMealNames[meal.id] ?? ''}
                        onChange={e =>
                          setCustomMealNames(prev => ({ ...prev, [meal.id]: e.target.value }))
                        }
                        placeholder={`Name (optional) — z.B. Frühstück, Post-Workout…`}
                        maxLength={60}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                      />
                      <button
                        onClick={() => saveMealToHistory(meal.id)}
                        disabled={savingHistoryId === meal.id || isFlashing}
                        className={`w-full px-4 py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50
                          ${isFlashing
                            ? 'bg-green-100 border border-green-400 text-green-700 ring-2 ring-green-400 animate-pulse'
                            : 'bg-green-50 hover:bg-green-100 border border-green-200 text-green-700'
                          }`}
                      >
                        {isFlashing
                          ? '✓ Gespeichert'
                          : savingHistoryId === meal.id
                            ? 'Speichern…'
                            : '✓ Mahlzeit speichern'
                        }
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* end collapsible body */}
              </Collapsible>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-center text-gray-400 px-4 pt-2 pb-4">Hauptquellen wählen, Zusatz ergänzen, dann berechnen.</p>

      {/* ─── Vorherige Mahlzeiten ────────────────────────────────────────── */}
      {mealHistory.length > 0 && (
        <div className="border-t border-gray-100 pt-6">
          <p className="text-[11px] text-gray-500 mb-2">
            Hinweis: Getränke werden nicht in der Mahlzeiten-Historie gespeichert. Nach dem Wiederverwenden bitte Getränke ggf. neu eintragen und Mengen bei Bedarf neu berechnen.
          </p>
          <MealHistorySection
            history={mealHistory}
            reusingId={reusingHistoryId}
            onReuse={reuseFromHistory}
            onDelete={id => { setMealHistory(prev => prev.filter(e => e.id !== id)); showToast('error', 'Eintrag gelöscht') }}
          />
        </div>
      )}

      {/* ─── Rezeptvorschläge ─────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-6">
        <p className="text-[11px] text-gray-500 mb-2">Rezepte dienen nur als Inspiration.</p>
        <RecipeSuggestions targetCalories={plan.target_calories} />
      </div>

      {/* ─── Toast notifications ─────────────────────────────────────────── */}
      <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-lg transition-all duration-300 pointer-events-none
              ${t.type === 'success' ? 'bg-green-500' : t.type === 'info' ? 'bg-blue-500' : 'bg-red-500'}`}
          >
            {t.message}
          </div>
        ))}
      </div>

    </div>
  )
}
