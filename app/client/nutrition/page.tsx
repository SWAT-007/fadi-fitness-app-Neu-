'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  calcMacros,
  type ClientMealFood, type Food, type FoodCategory,
  type NutritionGoal, type NutritionMeal, type NutritionPlan,
} from '@/lib/types'
import MealHistorySection from './MealHistorySection'
import RecipeSuggestions from './RecipeSuggestions'
import MealDrinks from './MealDrinks'
import type { MealHistoryEntry, HistoryIngredient, DrinkLog } from '@/lib/types'
import { EmptyState } from '@/components/ui/client-ui'
import { toastIconLabel, toastIconStyle, toastStyle, type ToastKind } from '@/components/Motion'

type FullPlan = NutritionPlan & { nutrition_meals: NutritionMeal[] }

const GOAL_META: Record<NutritionGoal, { label: string; bg: string }> = {
  cut:      { label: 'Abnehmen',     bg: 'bg-[#111111] border border-white/[0.06]'   },
  bulk:     { label: 'Muskelaufbau', bg: 'bg-[#111111] border border-white/[0.06]' },
  maintain: { label: 'Erhaltung',    bg: 'bg-[#A78BFA]/10'  },
}

const SLOT_CATS: FoodCategory[] = ['protein', 'carbs', 'fat']
const FREE_CATS: FoodCategory[] = ['vegetable']  // ignoriert in Berechnung
const SLOT_LABEL: Record<FoodCategory, string> = {
  protein: 'Eiweiß', carbs: 'Kohlenhydrate', fat: 'Fett',
  vegetable: 'Gemüse', fruit: 'Obst', dairy: 'Milchprodukt', other: 'Sonstiges',
}
const SLOT_COLOR: Record<FoodCategory, { dot: string; text: string; bar: string }> = {
  protein:   { dot: 'bg-blue-500',   text: 'text-blue-400',   bar: '#3b82f6' },
  carbs:     { dot: 'bg-green-500',  text: 'text-green-400',  bar: '#22c55e' },
  fat:       { dot: 'bg-yellow-500', text: 'text-yellow-400', bar: '#eab308' },
  vegetable: { dot: 'bg-[#A78BFA]/60',  text: 'text-[#A78BFA]',  bar: '#22c55e' },
  fruit:     { dot: 'bg-pink-500',   text: 'text-pink-700',   bar: '#ec4899' },
  dairy:     { dot: 'bg-purple-500', text: 'text-purple-700', bar: '#a855f7' },
  other:     { dot: 'bg-[#797D83]/60',   text: 'text-[#797D83]',   bar: '#9ca3af' },
}

type CmfWithFood = ClientMealFood & { food: Food }

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

interface Toast { id: number; type: ToastKind; message: string }

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
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(167,139,250,0.12)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke={over > 0 ? '#ef4444' : '#A78BFA'}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 400ms ease-out, stroke 300ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-[#EDECEA]">{displayVal}</span>
        <span className="text-[10px] text-[#797D83]">/ {target} kcal</span>
      </div>
    </div>
  )
}

function MiniBar({ current, target, color }: { current: number; target: number; color: string }) {
  const rawPct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  // When something is consumed against a real target, keep the bar visible.
  const pct = target > 0 && current > 0 ? Math.max(rawPct, 4) : rawPct
  const over = target > 0 && current > target
  return (
    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
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
    <div className="card-tertiary p-2 mx-2 mb-2">
      {list.length > 0 ? (
        <ul className="bg-[#181818] rounded-lg border border-white/[0.08] overflow-hidden shadow-2xl max-h-64 overflow-y-auto">
          {list.map(f => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => handlePick(f)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#A78BFA]/10 text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#EDECEA] truncate">{f.name}</div>
                  <div className="text-[10px] text-[#797D83]">
                    {f.kcal_per_100g} kcal · {f.protein_per_100g}P {f.carbs_per_100g}K {f.fat_per_100g}F / 100g
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#797D83] px-1 py-2">Nichts gefunden.</p>
      )}
    </div>
  )
}

type BackendCmf = {
  id: string; clientId: string; mealId: string | null; foodId: string | null
  category: string | null; amountG: number | null; isExtra: boolean; createdAt: string; updatedAt: string
  food: {
    id: string; name: string; caloriesPer100g: number | null; proteinPer100g: number | null
    carbsPer100g: number | null; fatPer100g: number | null; unit: string | null
  } | null
}

function mapCmf(c: BackendCmf): CmfWithFood {
  return {
    id: c.id,
    client_id: c.clientId,
    meal_id: c.mealId ?? '',
    food_id: c.foodId ?? '',
    amount_g: c.amountG ?? 0,
    created_at: c.createdAt,
    food: {
      id: c.food?.id ?? c.foodId ?? '',
      name: c.food?.name ?? '',
      kcal_per_100g: c.food?.caloriesPer100g ?? 0,
      protein_per_100g: c.food?.proteinPer100g ?? 0,
      carbs_per_100g: c.food?.carbsPer100g ?? 0,
      fat_per_100g: c.food?.fatPer100g ?? 0,
      category: (c.category ?? 'other') as FoodCategory,
      unit: c.food?.unit ?? 'g',
      trainer_id: null,
      created_at: '',
    } as Food,
  } as CmfWithFood
}

type BackendMealHistory = {
  id: string; clientId: string; name: string | null; category: string | null
  amountG: number | null; calories: number | null; protein: number | null
  carbs: number | null; fat: number | null; loggedAt: string
}

function mapMealHistory(h: BackendMealHistory): MealHistoryEntry {
  return {
    id: h.id,
    client_id: h.clientId,
    meal_name: h.name ?? 'Mahlzeit',
    total_calories: h.calories ?? null,
    logged_at: h.loggedAt,
    ingredients: [{
      food_id: '',
      category: h.category ?? 'other',
      name: h.name ?? '',
      grams: h.amountG ?? 0,
      calories: Math.round(h.calories ?? 0),
      protein: Math.round(h.protein ?? 0),
      carbs: Math.round(h.carbs ?? 0),
      fat: Math.round(h.fat ?? 0),
    }],
  }
}

type BackendDrinkLog = {
  id: string; clientId: string; drinkType: string | null
  amountMl: number | null; calories: number | null; mealId: string | null; loggedAt: string
}

// Local extension of the shared DrinkLog with the persisted meal reference.
type DrinkLogWithMeal = DrinkLog & { meal_id: string | null }

function mapDrinkLog(d: BackendDrinkLog): DrinkLogWithMeal {
  return {
    id: d.id,
    client_id: d.clientId,
    drink_name: d.drinkType ?? '',
    calories: d.calories ?? null,
    meal_number: null,
    meal_id: d.mealId ?? null,
    logged_at: d.loggedAt,
  }
}

type DrinkCatalogItem = { id: string; name: string; kcalPer100ml: number | null; unit: string | null }

type MacroKey = 'protein' | 'carbs' | 'fat'

const MACRO_KEYS: MacroKey[] = ['protein', 'carbs', 'fat']

const macroDensity = (food: Food, macro: MacroKey) => {
  if (macro === 'protein') return food.protein_per_100g / 100
  if (macro === 'carbs') return food.carbs_per_100g / 100
  return food.fat_per_100g / 100
}

const macroCategory = (macro: MacroKey): FoodCategory => macro

const mealTarget = (meal: NutritionMeal, macro: MacroKey) => {
  if (macro === 'protein') return meal.target_protein
  if (macro === 'carbs') return meal.target_carbs
  return meal.target_fat
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

  // Drink logs (today only) + trainer-managed drink catalog
  const [drinkLogs, setDrinkLogs] = useState<DrinkLogWithMeal[]>([])
  const [drinksCatalog, setDrinksCatalog] = useState<DrinkCatalogItem[]>([])

  // Meal history state
  const [mealHistory, setMealHistory]       = useState<MealHistoryEntry[]>([])
  const [savedMealIds, setSavedMealIds]     = useState<Set<string>>(new Set())
  const [savingHistoryId, setSavingHistoryId] = useState<string | null>(null)
  const [reusingHistoryId, setReusingHistoryId] = useState<string | null>(null)

  // Custom name input per meal (before saving to history)
  const [customMealNames, setCustomMealNames] = useState<Record<string, string>>({})

  // Extra (Zusatz) food slots — picked from the same food DB, grams set by user
  // { [mealId]: { protein?: { food, grams }, carbs?: ..., fat?: ... } }
  interface ExtraSlot { id: string; food: Food; grams: string }
  type ExtraSlotMap = Record<string, Partial<Record<FoodCategory, ExtraSlot>>>
  const [extraSlots, setExtraSlots] = useState<ExtraSlotMap>({})

  // Separate picker state for the Zusatz row (avoids conflicting with main openPicker)
  const [openExtraPicker, setOpenExtraPicker] = useState<{ mealId: string; cat: FoodCategory } | null>(null)

  // ── Save button flash ──
  const [saveFlash, setSaveFlash] = useState<Set<string>>(new Set())

  // Per-meal warning lines (overshoot details) produced by "Berechnen"
  const [calcWarnings, setCalcWarnings] = useState<Map<string, string[]>>(new Map())
  // Meals that have been calculated at least once (a computed 0 g source is valid)
  const [calculatedMeals, setCalculatedMeals] = useState<Set<string>>(new Set())
  const invalidateCalc = (mealId: string) =>
    setCalculatedMeals(prev => {
      if (!prev.has(mealId)) return prev
      const s = new Set(prev); s.delete(mealId); return s
    })

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


  // ─── Zusatzquellen-Persistenz (ClientMealFood mit isExtra=true) ────────────
  // Neue Zusatzquelle anlegen (max. 1 pro Makro — ersetzt vorhandene serverseitig).
  const addExtra = async (mealId: string, cat: FoodCategory, food: Food) => {
    invalidateCalc(mealId)
    const existing = extraSlots[mealId]?.[cat]
    if (existing) { await replaceExtraFood(mealId, cat, food); return }
    try {
      const res = await fetch('/api/backend/me/nutrition/client-meal-foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId, foodId: food.id, category: cat, amountG: 30, isExtra: true }),
      })
      const data = await res.json().catch(() => null) as { clientMealFood?: { id: string } } | null
      if (!res.ok || !data?.clientMealFood) { showToast('danger', 'Fehler beim Hinzufügen'); return }
      setExtraSlot(mealId, cat, { id: data.clientMealFood.id, food, grams: '30' })
    } catch { showToast('danger', 'Fehler beim Hinzufügen') }
  }

  // Food der bestehenden Zusatzquelle tauschen (Gramm bleiben).
  const replaceExtraFood = async (mealId: string, cat: FoodCategory, food: Food) => {
    invalidateCalc(mealId)
    const existing = extraSlots[mealId]?.[cat]
    if (!existing) return
    try {
      const res = await fetch(`/api/backend/me/nutrition/client-meal-foods/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodId: food.id, category: cat }),
      })
      if (!res.ok) { showToast('danger', 'Fehler beim Ändern'); return }
      setExtraSlot(mealId, cat, { ...existing, food })
    } catch { showToast('danger', 'Fehler beim Ändern') }
  }

  // Eingegebene Gramm persistieren (on blur).
  const persistExtraGrams = async (mealId: string, cat: FoodCategory) => {
    invalidateCalc(mealId)
    const existing = extraSlots[mealId]?.[cat]
    if (!existing) return
    const grams = Math.max(0, parseFloat(existing.grams) || 0)
    try {
      await fetch(`/api/backend/me/nutrition/client-meal-foods/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountG: grams }),
      })
    } catch { showToast('danger', 'Fehler beim Speichern') }
  }

  // Zusatzquelle entfernen (DB-Zeile löschen + aus State).
  const removeExtra = async (mealId: string, cat: FoodCategory) => {
    invalidateCalc(mealId)
    const existing = extraSlots[mealId]?.[cat]
    setExtraSlot(mealId, cat, null)
    if (!existing) return
    try {
      await fetch(`/api/backend/me/nutrition/client-meal-foods/${existing.id}`, { method: 'DELETE' })
    } catch { showToast('danger', 'Fehler beim Entfernen') }
  }

  // Collapsible state — Set of open meal IDs (plan meals + history entries)
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())
  const toggleCard = (id: string) =>
    setOpenCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })

  const DEFERRED_WRITE_MESSAGE = 'Diese Aktion wird im nächsten Migrationsschritt auf das Backend umgestellt.'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/backend/me/nutrition', { cache: 'no-store' })
      const payload = (await response.json().catch(() => null)) as {
        client?: { id: string; fullName: string; trainerId: string }
        activeNutritionPlan?: {
          id: string
          clientId: string
          planId: string
          active: boolean
          assignedAt: string
          plan: {
            id: string
            name: string
            description: string | null
            meals: Array<{
              id: string; planId: string; name: string; sortOrder: number
              targetProtein: number | null
              targetCarbs: number | null
              targetFat: number | null
              targetVegetableG: number | null
              allowedCategories: FoodCategory[] | null
            }>
          }
        } | null
        foods?: Array<{
          id: string
          name: string
          caloriesPer100g: number | null
          proteinPer100g: number | null
          carbsPer100g: number | null
          fatPer100g: number | null
          unit: string | null
          category: string | null
        }>
        drinks?: DrinkCatalogItem[]
        clientMealFoods?: BackendCmf[]
        mealHistory?: BackendMealHistory[]
        drinkLogs?: BackendDrinkLog[]
      } | null

      if (!response.ok || !payload) return

      setClientId(payload.client?.id ?? null)
      // userId stays null — MealDrinks writes are deferred for this slice

      const anp = payload.activeNutritionPlan
      if (!anp) {
        setFoods([])
        return
      }

      const mappedMeals: NutritionMeal[] = (anp.plan.meals ?? []).map((m) => {
        const target_protein = m.targetProtein ?? 0
        const target_carbs = m.targetCarbs ?? 0
        const target_fat = m.targetFat ?? 0
        return {
          id: m.id,
          plan_id: m.planId,
          name: m.name,
          sort_order: m.sortOrder,
          // kcal is derived from macros (4/4/9), never stored
          target_kcal: target_protein * 4 + target_carbs * 4 + target_fat * 9,
          target_protein,
          target_carbs,
          target_fat,
          target_vegetable_g: m.targetVegetableG ?? 0,
          allowed_categories: (m.allowedCategories ?? ['protein', 'carbs', 'fat', 'vegetable']) as FoodCategory[],
          created_at: '',
        }
      })

      // Daily targets = sum of per-meal targets (no plan-level field)
      const dayTargetProtein = mappedMeals.reduce((s, m) => s + m.target_protein, 0)
      const dayTargetCarbs = mappedMeals.reduce((s, m) => s + m.target_carbs, 0)
      const dayTargetFat = mappedMeals.reduce((s, m) => s + m.target_fat, 0)

      const mappedPlan: FullPlan = {
        id: anp.plan.id,
        trainer_id: '',
        name: anp.plan.name,
        description: anp.plan.description,
        goal: 'maintain',
        target_calories: dayTargetProtein * 4 + dayTargetCarbs * 4 + dayTargetFat * 9,
        target_protein: dayTargetProtein,
        target_carbs: dayTargetCarbs,
        target_fat: dayTargetFat,
        created_at: anp.assignedAt,
        nutrition_meals: mappedMeals,
      }
      setPlan(mappedPlan)

      const mappedFoods: Food[] = (payload.foods ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        kcal_per_100g: f.caloriesPer100g ?? 0,
        protein_per_100g: f.proteinPer100g ?? 0,
        carbs_per_100g: f.carbsPer100g ?? 0,
        fat_per_100g: f.fatPer100g ?? 0,
        category: (f.category ?? 'other') as FoodCategory,
        unit: f.unit ?? 'g',
        trainer_id: null,
        created_at: '',
      } as Food))
      setFoods(mappedFoods)

      // Split persisted ClientMealFood into main sources (isExtra=false → cmf)
      // and extra sources (isExtra=true → extraSlots, hydrated with their id).
      const allCmf = (payload.clientMealFoods ?? []).filter(c => c.food !== null)
      setCmf(allCmf.filter(c => !c.isExtra).map(mapCmf))
      const hydratedExtras: ExtraSlotMap = {}
      for (const c of allCmf) {
        if (!c.isExtra || !c.mealId) continue
        const cat = (c.category ?? 'other') as FoodCategory
        if (!hydratedExtras[c.mealId]) hydratedExtras[c.mealId] = {}
        hydratedExtras[c.mealId]![cat] = { id: c.id, food: mapCmf(c).food, grams: String(c.amountG ?? 0) }
      }
      setExtraSlots(hydratedExtras)
      setMealHistory((payload.mealHistory ?? []).map(mapMealHistory))
      setDrinkLogs((payload.drinkLogs ?? []).map(mapDrinkLog))
      setDrinksCatalog(payload.drinks ?? [])
    } catch {
      // network or parse error — leave plan=null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Slot pick: ersetzt Wahl in derselben Kategorie. Setzt amount_g=0 ("noch
  //     nicht berechnet") und resettet auch andere Slots dieser Mahlzeit auf 0,
  //     damit Kunde am Ende „Berechnen" klickt. ────────────────────────────

  const pickSlot = async (mealId: string, food: Food, slotCat: FoodCategory) => {
    invalidateCalc(mealId)
    const toDelete = cmf.filter(c => c.meal_id === mealId && c.food.category === slotCat)
    const toReset  = cmf.filter(c => c.meal_id === mealId && c.food.category !== slotCat)
    try {
      await Promise.all(
        toDelete.map(c =>
          fetch(`/api/backend/me/nutrition/client-meal-foods/${c.id}`, { method: 'DELETE' }),
        ),
      )
      await Promise.allSettled(
        toReset.map(c =>
          fetch(`/api/backend/me/nutrition/client-meal-foods/${c.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountG: 0 }),
          }),
        ),
      )
      const res = await fetch('/api/backend/me/nutrition/client-meal-foods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId, foodId: food.id, category: slotCat, amountG: 0 }),
      })
      if (!res.ok) { showToast('danger', 'Fehler beim Speichern'); return }
      const data = (await res.json().catch(() => null)) as { clientMealFood?: BackendCmf } | null
      if (!data?.clientMealFood) { showToast('danger', 'Fehler beim Speichern'); return }
      setCmf(prev => [
        ...prev
          .filter(c => !(c.meal_id === mealId && c.food.category === slotCat))
          .map(c => c.meal_id === mealId ? { ...c, amount_g: 0 } : c),
        mapCmf(data.clientMealFood!),
      ])
      setOpenPicker(null)
    } catch {
      showToast('danger', 'Fehler beim Speichern')
    }
  }

  const clearSlot = async (mealId: string, cat: FoodCategory) => {
    invalidateCalc(mealId)
    const toDelete = cmf.filter(c => c.meal_id === mealId && c.food.category === cat)
    const toReset  = cmf.filter(c => c.meal_id === mealId && c.food.category !== cat)
    try {
      await Promise.all(
        toDelete.map(c =>
          fetch(`/api/backend/me/nutrition/client-meal-foods/${c.id}`, { method: 'DELETE' }),
        ),
      )
      await Promise.allSettled(
        toReset.map(c =>
          fetch(`/api/backend/me/nutrition/client-meal-foods/${c.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountG: 0 }),
          }),
        ),
      )
      setCmf(prev => [
        ...prev
          .filter(c => !(c.meal_id === mealId && c.food.category === cat))
          .map(c => c.meal_id === mealId ? { ...c, amount_g: 0 } : c),
      ])
    } catch {
      showToast('danger', 'Fehler beim Entfernen')
    }
  }

  // ─── „Berechnen" ─────────────────────────────────────────────────────────
  // Gauss-Seidel fills each selected main source toward its leading macro.
  const calcMeal = async (mealId: string) => {
    if (!plan) return
    const meal = plan.nutrition_meals.find(m => m.id === mealId)
    if (!meal) return
    const slots = slotsByMeal[mealId] ?? {}

    const mains = MACRO_KEYS
      .map(macro => {
        const source = slots[macroCategory(macro)]
        return source ? { macro, source } : null
      })
      .filter(Boolean) as Array<{ macro: MacroKey; source: CmfWithFood }>
    if (mains.length === 0) {
      showToast('info', 'Keine Hauptquelle gewählt.')
      return
    }

    const extra = { protein: 0, carbs: 0, fat: 0 } satisfies Record<MacroKey, number>
    for (const slot of Object.values(extraSlots[mealId] ?? {})) {
      if (!slot) continue
      if (isFreeCat(slot.food.category)) continue
      const g = Math.max(0, parseFloat(slot.grams) || 0)
      const m = calcMacros(slot.food, g)
      extra.protein += m.protein
      extra.carbs += m.carbs
      extra.fat += m.fat
    }

    // Gauss-Seidel: each source fills its leading macro after current cross-contributions.
    const gramsByMacro = Object.fromEntries(
      mains.map(({ macro, source }) => [macro, Math.max(0, source.amount_g ?? 0)]),
    ) as Record<MacroKey, number>

    for (let pass = 0; pass < 12; pass++) {
      for (const { macro, source } of mains) {
        const density = macroDensity(source.food, macro)
        const otherContribution = mains.reduce((sum, other) => {
          if (other.macro === macro) return sum
          return sum + macroDensity(other.source.food, macro) * (gramsByMacro[other.macro] ?? 0)
        }, extra[macro])
        gramsByMacro[macro] = density > 0
          ? Math.max(0, (mealTarget(meal, macro) - otherContribution) / density)
          : 0
      }
    }

    const updates = mains.map(({ macro, source }) => ({
      id: source.id,
      amountG: Math.max(0, Math.round(gramsByMacro[macro] ?? 0)),
    }))

    const got = { ...extra }
    for (const { source } of mains) {
      const grams = updates.find(u => u.id === source.id)?.amountG ?? 0
      got.protein += macroDensity(source.food, 'protein') * grams
      got.carbs += macroDensity(source.food, 'carbs') * grams
      got.fat += macroDensity(source.food, 'fat') * grams
    }
    // Concrete hint for each macro that unavoidably OVERSHOOTS the target by > 3 g.
    const warningLines: string[] = []
    for (const macro of MACRO_KEYS) {
      const target = mealTarget(meal, macro)
      const actual = Math.round(got[macro])
      if (actual - target > 3) {
        const label = SLOT_LABEL[macro]
        warningLines.push(
          `${label}: ${actual} g statt ${target} g – die gewählten Quellen liefern schon ${actual} g ${label}. Wähle eine magerere Quelle oder erhöhe das ${label}-Ziel.`,
        )
      }
    }

    try {
      await Promise.all(updates.map(u =>
        fetch(`/api/backend/me/nutrition/client-meal-foods/${u.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountG: u.amountG }),
        }),
      ))
      // Lokalen State aktualisieren → dayTotals, Makro-Bars und kcal-Ring rechnen neu.
      setCmf(prev => prev.map(c => {
        const u = updates.find(x => x.id === c.id)
        return u ? { ...c, amount_g: u.amountG } : c
      }))
      setCalcWarnings(prev => {
        const m = new Map(prev)
        if (warningLines.length > 0) m.set(mealId, warningLines); else m.delete(mealId)
        return m
      })
      // Meal counts as calculated — a computed 0 g source is valid (Bug A).
      setCalculatedMeals(prev => { const s = new Set(prev); s.add(mealId); return s })
      showToast('success', 'Berechnet ✓')
    } catch {
      showToast('danger', 'Fehler beim Berechnen')
    }
  }

  // ─── Meal History: save ───────────────────────────────────────────────────

  const saveMealToHistory = async (mealId: string) => {
    if (!plan) return
    const meal = plan.nutrition_meals.find(m => m.id === mealId)
    if (!meal) return
    const mealCmf = cmf.filter(c => c.meal_id === mealId)
    if (mealCmf.length === 0) return
    const name = customMealNames[mealId]?.trim() || meal.name
    const totals = sumMacros(mealCmf)
    setSavingHistoryId(mealId)
    try {
      const res = await fetch('/api/backend/me/nutrition/meal-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          calories: Math.round(totals.cal),
          protein: Math.round(totals.p),
          carbs: Math.round(totals.k),
          fat: Math.round(totals.f),
        }),
      })
      if (!res.ok) { showToast('danger', 'Fehler beim Speichern'); return }
      const data = (await res.json().catch(() => null)) as { mealHistoryItem?: BackendMealHistory } | null
      if (!data?.mealHistoryItem) { showToast('danger', 'Fehler beim Speichern'); return }
      setMealHistory(prev => [mapMealHistory(data.mealHistoryItem!), ...prev])
      setSavedMealIds(prev => { const s = new Set(prev); s.add(mealId); return s })
      setSaveFlash(prev => { const s = new Set(prev); s.add(mealId); return s })
      setTimeout(() => setSaveFlash(prev => { const s = new Set(prev); s.delete(mealId); return s }), 1500)
    } catch {
      showToast('danger', 'Fehler beim Speichern')
    } finally {
      setSavingHistoryId(null)
    }
  }

  // ─── Meal History: reuse ──────────────────────────────────────────────────

  const reuseFromHistory = async (_entry: MealHistoryEntry) => {
    showToast('info', DEFERRED_WRITE_MESSAGE)
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
        if (isFreeCat(slot.food.category)) continue
        const g = Math.max(0, parseFloat(slot.grams) || 0)
        const m = calcMacros(slot.food, g)
        ep += m.protein; ek += m.carbs; ef += m.fat; ecal += m.calories
      }
    }
    // Add today's drink calories to the daily total
    const drinkCal = drinkLogs.reduce((s, d) => s + Number(d.calories ?? 0), 0)
    return { p: base.p + ep, k: base.k + ek, f: base.f + ef, cal: base.cal + ecal + drinkCal }
  }, [cmf, extraSlots, drinkLogs])
  const slotsByMeal: Record<string, Partial<Record<FoodCategory, CmfWithFood>>> = {}
  for (const c of cmf) {
    if (!slotsByMeal[c.meal_id]) slotsByMeal[c.meal_id] = {}
    slotsByMeal[c.meal_id][c.food.category] = c
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" /></div>

  if (!plan) {
    return (
      <div className="p-6 max-w-[480px] mx-auto">
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06]">
          <EmptyState
            icon={<svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c-4 0-7-3.5-7-8 0-3 2-5 4-5 1.2 0 1.8.5 3 .5s1.8-.5 3-.5c2 0 4 2 4 5 0 4.5-3 8-7 8z" /><path d="M12 8c0-2.5 1.5-4 4-4" /></svg>}
            title="Kein Ernährungsplan"
            subtext="Sobald dein Trainer dir einen Plan zuweist, erscheint er hier."
          />
        </div>
      </div>
    )
  }

  const goalMeta = GOAL_META[plan.goal]

  return (
    <div className="p-4 max-w-[480px] mx-auto space-y-4">
      {/* ─── Header: Plan + Tagesübersicht ───────────────────────────────── */}
      <div className="card-secondary p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-section">{goalMeta.label}</p>
            <h1 className="text-display mt-0.5">{plan.name}</h1>
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
                <span className="text-[#797D83] font-medium">{m.l}</span>
                <span className="text-[#797D83]"><b className="text-[#EDECEA]">{Math.round(m.cur)}</b> / {m.tgt}g</span>
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
            if (isFreeCat(slot.food.category)) continue
            const g = Math.max(0, parseFloat(slot.grams) || 0)
            const em = calcMacros(slot.food, g)
            mEP += em.protein; mEK += em.carbs; mEF += em.fat; mECal += em.calories
          }
          // Add this meal's drink calories to the per-meal total (matched by mealId
          // so it stays correct after reload).
          const mealDrinkCal = drinkLogs
            .filter(d => d.meal_id === meal.id)
            .reduce((s, d) => s + Number(d.calories ?? 0), 0)
          const tAdj = { p: t.p + mEP, k: t.k + mEK, f: t.f + mEF, cal: t.cal + mECal + mealDrinkCal }

          const macroLines = [
            { cat: 'protein' as FoodCategory, cur: tAdj.p, tgt: meal.target_protein },
            { cat: 'carbs'   as FoodCategory, cur: tAdj.k, tgt: meal.target_carbs   },
            { cat: 'fat'     as FoodCategory, cur: tAdj.f, tgt: meal.target_fat     },
          ].filter(m => allowed.includes(m.cat))

          // A meal is ready to save once it has been calculated (a computed 0 g
          // source is valid), or — for older data — when every source has grams.
          const allCalculated = items.length > 0 && (
            calculatedMeals.has(meal.id) || items.every(it => (it.amount_g ?? 0) > 0)
          )

          const isOpen = openCards.has(meal.id)
          const isFlashing = saveFlash.has(meal.id)

          return (
            <div key={meal.id} className="card-secondary overflow-hidden">
              {/* Mahlzeit-Header — always visible, click to expand/collapse */}
              <button
                onClick={() => toggleCard(meal.id)}
                className="w-full text-left px-5 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-card-title">
                    <span className="text-[#797D83] text-sm font-medium mr-2">#{i + 1}</span>
                    {meal.name}
                  </h2>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-[#797D83]">
                      <b className="text-[#EDECEA]">{Math.round(tAdj.cal)}</b> / {targetKcal} kcal
                    </span>
                    <svg
                      className={`w-4 h-4 text-[#797D83] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {macroLines.map(m => {
                    const diff = m.tgt - m.cur
                    const over = diff < 0
                    const metKey = `${meal.id}-${m.cat}`
                    return (
                      <div key={m.cat}>
                        <div className="flex items-center gap-1 text-[10px] text-[#797D83] mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${SLOT_COLOR[m.cat].dot}`} />
                          <span>{SLOT_LABEL[m.cat]}</span>
                          {macroMet.has(metKey) && (
                            <span className="text-[9px] text-[#A78BFA] ml-0.5 animate-pulse">✓</span>
                          )}
                          <span className="ml-auto">
                            <b className="text-[#EDECEA]">{Math.round(m.cur)}</b>/{m.tgt}g
                          </span>
                        </div>
                        <MiniBar current={m.cur} target={m.tgt} color={SLOT_COLOR[m.cat].bar} />
                        <p className={`text-[9px] mt-0.5 ${over ? 'text-red-500' : 'text-[#797D83]'}`}>
                          {over ? `+${Math.abs(Math.round(diff))} über` : diff > 0 ? `${Math.round(diff)} offen` : '✓'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </button>

              {(calcWarnings.get(meal.id)?.length ?? 0) > 0 && (
                <div className="px-5 pb-2 space-y-1">
                  {calcWarnings.get(meal.id)!.map((line, idx) => (
                    <p key={idx} className="text-[10px] leading-snug text-amber-300/90">{line}</p>
                  ))}
                </div>
              )}

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
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#A78BFA]/10/40 text-left transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                          <span className="text-sm text-[#797D83] flex-1">{SLOT_LABEL[cat]}quelle wählen…</span>
                          <span className="text-[#A78BFA] text-sm font-medium">{pickerCat === cat ? '−' : '+'}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 px-5 py-3">
                          <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[#EDECEA] truncate">{picked.food.name}</div>
                            {calculated && m ? (
                              <div className="text-[10px] text-[#797D83]">
                                <b className="text-[#EDECEA]/90">{Math.round(picked.amount_g)} g</b>
                                <span className="mx-1">·</span>
                                {Math.round(m.calories)} kcal · {Math.round(m.protein)}P {Math.round(m.carbs)}K {Math.round(m.fat)}F
                              </div>
                            ) : (
                              <div className="text-[10px] text-[#797D83]">
                                {picked.food.kcal_per_100g} kcal · {picked.food.protein_per_100g}P {picked.food.carbs_per_100g}K {picked.food.fat_per_100g}F <span className="text-[#797D83]/60">/ 100g</span>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setOpenPicker({ mealId: meal.id, cat })}
                            className="text-[11px] text-[#797D83] hover:text-[#EDECEA]/90 underline flex-shrink-0"
                          >
                            Ändern
                          </button>
                          <button
                            onClick={() => clearSlot(meal.id, cat)}
                            className="text-[#797D83]/60 hover:text-red-500 flex-shrink-0"
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
                          onPick={(food) => pickSlot(meal.id, food, cat)}
                        />
                      )}

                      {/* ── Zusatzquelle row ── */}
                      {idx === 0 && <div className="px-5 py-1 bg-white/[0.02] border-t border-dashed border-white/[0.06]" />}
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
                                className="w-full flex items-center gap-3 pl-8 pr-5 py-2 hover:bg-white/[0.03] text-left transition-colors border-t border-dashed border-white/[0.06]"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dot} opacity-30`} />
                                <span className="text-xs italic text-[#797D83] flex-1">Zusatzquelle wählen…</span>
                                <span className="text-[#797D83] text-xs font-medium">{extraPickerOpen ? '−' : '+'}</span>
                              </button>
                              {extraPickerOpen && (
                                <SlotPicker
                                  category={cat}
                                  foods={foods}
                                  onPick={food => {
                                    void addExtra(meal.id, cat, food)
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
                            <div className={`flex items-center gap-3 pl-8 pr-5 py-2.5 border-t border-dashed border-white/[0.06] border-l-2 ${c.dot.replace('bg-', 'border-l-')} border-l-opacity-40`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot} opacity-30 flex-shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-[#797D83] italic truncate">{extraSlot.food.name}</div>
                                {extraG > 0 && (
                                  <div className="text-[10px] text-[#797D83] mt-0.5">
                                    <b className="text-[#797D83] not-italic">{extraG} g</b>
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
                                  onBlur={() => void persistExtraGrams(meal.id, cat)}
                                  min="0"
                                  className="w-16 px-2 py-1 pr-5 text-xs border border-white/[0.1] rounded-lg bg-white/[0.06] text-[#EDECEA] focus:ring-1 focus:ring-[#A78BFA] focus:outline-none text-right"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[#797D83] pointer-events-none">g</span>
                              </div>
                              <button
                                onClick={() =>
                                  extraPickerOpen
                                    ? setOpenExtraPicker(null)
                                    : setOpenExtraPicker({ mealId: meal.id, cat })
                                }
                                className="text-[11px] text-[#797D83] hover:text-[#EDECEA]/90 underline flex-shrink-0"
                              >
                                Ändern
                              </button>
                              <button
                                onClick={() => void removeExtra(meal.id, cat)}
                                className="text-[#797D83]/60 hover:text-red-500 flex-shrink-0 transition-colors"
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
                                  void replaceExtraFood(meal.id, cat, food)
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
                <div className="divide-y divide-gray-50 border-t border-white/[0.04] bg-[#A78BFA]/10/20">
                  {allowedFree.map(cat => {
                    const picked = slots[cat]
                    const c = SLOT_COLOR[cat]
                    const trainerG = Math.max(0, Math.round(meal.target_vegetable_g ?? 0))
                    return (
                      <div key={cat}>
                        {!picked ? (
                          <button
                            onClick={() => setOpenPicker({ mealId: meal.id, cat })}
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#A78BFA]/15/40 text-left transition-colors"
                          >
                            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                            <span className="text-sm text-[#797D83] flex-1">
                              {SLOT_LABEL[cat]} wählen
                              {trainerG > 0 && <span className="ml-1.5 text-[10px] text-[#797D83]">({trainerG}g vom Trainer)</span>}
                            </span>
                            <span className="text-[#A78BFA] text-sm font-medium">+</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-3">
                            <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-[#EDECEA] truncate">{picked.food.name}</div>
                              <div className="text-[10px] text-[#797D83]">
                                <b className="text-[#EDECEA]/90">{trainerG} g</b>
                                <span className="ml-1 text-[#797D83]/60">vom Trainer festgelegt</span>
                              </div>
                            </div>
                            <button
                              onClick={() => setOpenPicker({ mealId: meal.id, cat })}
                              className="text-[11px] text-[#797D83] hover:text-[#EDECEA]/90 underline flex-shrink-0"
                            >
                              Ändern
                            </button>
                            <button
                              onClick={() => clearSlot(meal.id, cat)}
                              className="text-[#797D83]/60 hover:text-red-500 flex-shrink-0"
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
                            onPick={(food) => pickSlot(meal.id, food, cat)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* „Berechnen" — visible once the meal has targets and at least one main source. */}
              {(() => {
                const macroItems = SLOT_CATS.map(c => slots[c]).filter(Boolean) as CmfWithFood[]
                const hasMacroTargets = MACRO_KEYS.some(macro => mealTarget(meal, macro) > 0)
                if (hasMacroTargets && macroItems.length > 0) {
                  return (
                    <div className="px-5 py-3 bg-[#A78BFA]/[0.06] border-t border-[#A78BFA]/20">
                      <button
                        onClick={() => calcMeal(meal.id)}
                        className="w-full px-4 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl transition-colors"
                      >
                        Mengen berechnen
                      </button>
                      <p className="text-[10px] text-center text-[#797D83] mt-1.5">Zielwerte werden mit Zusatz neu verrechnet.</p>
                    </div>
                  )
                }
                return null
              })()}

              {/* ── Getränke ─────────────────────────────────────────────────── */}
              {clientId && (
                <MealDrinks
                  mealId={meal.id}
                  drinksCatalog={drinksCatalog}
                  logs={drinkLogs}
                  onAdd={log => { setDrinkLogs(prev => [...prev, log]); showToast('info', 'Getränk hinzugefügt ✓') }}
                  onDelete={id => setDrinkLogs(prev => prev.filter(d => d.id !== id))}
                />
              )}

              {/* ── Mahlzeit speichern (erscheint wenn alle Mengen berechnet) ── */}
              {allCalculated && (
                <div className="px-5 py-3 border-t border-white/[0.04] space-y-2">
                  {savedMealIds.has(meal.id) && !isFlashing ? (
                    <p className="text-xs text-center text-[#A78BFA] font-semibold py-1">
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
                        className="w-full px-3 py-2 border border-white/[0.1] rounded-xl text-sm text-[#EDECEA] placeholder-gray-400 focus:border-[#A78BFA]/40 focus:outline-none transition"
                      />
                      <button
                        onClick={() => saveMealToHistory(meal.id)}
                        disabled={savingHistoryId === meal.id || isFlashing}
                        className={`w-full px-4 py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50
                          ${isFlashing
                            ? 'bg-[#A78BFA]/10 border border-[#A78BFA]/40 text-[#A78BFA] ring-2 ring-[#A78BFA]/40 animate-pulse'
                            : 'bg-[#A78BFA]/10 hover:bg-[#A78BFA]/15 border border-[#A78BFA]/20 text-[#A78BFA]'
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


      {/* ─── Vorherige Mahlzeiten ────────────────────────────────────────── */}
      {mealHistory.length > 0 && (
        <div className="border-t border-white/[0.04] pt-4">
          <MealHistorySection
            history={mealHistory}
            reusingId={reusingHistoryId}
            onReuse={reuseFromHistory}
            onDelete={async (id) => {
                await fetch(`/api/backend/me/nutrition/meal-history/${id}`, { method: 'DELETE' })
                setMealHistory(prev => prev.filter(e => e.id !== id))
                showToast('danger', 'Eintrag gelöscht')
              }}
          />
        </div>
      )}

      {/* ─── Rezeptvorschläge ─────────────────────────────────────────────── */}
      <div className="border-t border-white/[0.04] pt-4">
        <p className="text-[11px] text-[#797D83] mb-1.5">Rezepte dienen nur als Inspiration.</p>
        <RecipeSuggestions targetCalories={plan.target_calories} />
      </div>

      {/* ─── Toast notifications ─────────────────────────────────────────── */}
      <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`motion-toast pointer-events-none flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl transition-all duration-300 ${toastStyle[t.type]}`}
          >
            <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${toastIconStyle[t.type]}`}>
              {toastIconLabel[t.type]}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

    </div>
  )
}

