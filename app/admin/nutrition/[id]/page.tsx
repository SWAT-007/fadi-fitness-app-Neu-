'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  type Client, type FoodCategory,
  type NutritionGoal, type NutritionMeal, type NutritionPlan,
} from '@/lib/types'

// ─── Local types ──────────────────────────────────────────────────────────────

type AssignedRow = {
  id: string
  client_id: string
  is_active: boolean
  client: { id: string; full_name: string; email?: string | null }
}

const GOAL_LABEL: Record<NutritionGoal, string> = {
  cut: 'Abnehmen', bulk: 'Muskelaufbau', maintain: 'Erhaltung',
}

// Welche Kategorien darf der Trainer pro Mahlzeit zulassen?
const ALLOWED_CATEGORIES: FoodCategory[] = ['protein', 'carbs', 'fat', 'vegetable']
const CAT_LABEL: Record<FoodCategory, string> = {
  protein: 'Eiweiß', carbs: 'Kohlenhydrate', fat: 'Fett',
  vegetable: 'Gemüse', fruit: 'Obst', dairy: 'Milchprodukt', other: 'Sonstiges',
}
const CAT_BADGE: Record<FoodCategory, string> = {
  protein:   'bg-blue-500/10 text-blue-400',
  carbs:     'bg-orange-500/10 text-orange-400',
  fat:       'bg-yellow-500/10 text-yellow-400',
  vegetable: 'bg-green-500/10 text-green-400',
  fruit:     'bg-pink-500/10 text-pink-400',
  dairy:     'bg-[#A78BFA]/10 text-[#A78BFA]',
  other:     'bg-white/[0.04] text-[#797D83]',
}

function macroSum(meals: NutritionMeal[]) {
  return meals.reduce((a, m) => ({
    cal: a.cal + (m.target_kcal    ?? 0),
    p:   a.p   + (m.target_protein ?? 0),
    k:   a.k   + (m.target_carbs   ?? 0),
    f:   a.f   + (m.target_fat     ?? 0),
  }), { cal: 0, p: 0, k: 0, f: 0 })
}

function MacroBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

// ─── Meal Editor ──────────────────────────────────────────────────────────────

function MealEditor({
  meal, onChange, onDelete,
}: {
  meal: NutritionMeal
  onChange: (patch: Partial<NutritionMeal>) => void
  onDelete: () => void
}) {
  const allowed = new Set(meal.allowed_categories ?? ALLOWED_CATEGORIES)

  const toggleCategory = (cat: FoodCategory) => {
    const next = new Set(allowed)
    if (next.has(cat)) next.delete(cat); else next.add(cat)
    onChange({ allowed_categories: Array.from(next) as FoodCategory[] })
  }

  return (
    <div className="bg-[#111318] rounded-2xl border border-white/[0.06] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
        <input
          defaultValue={meal.name}
          onBlur={e => onChange({ name: e.target.value.trim() || meal.name })}
          className="flex-1 font-semibold text-white bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-[#A78BFA]/50 rounded-lg px-2 py-0.5 -ml-2"
        />
        <button onClick={onDelete} className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-red-500/10 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Ziel-Makros — Trainer gibt P/K/F ein, kcal wird automatisch berechnet */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-semibold text-[#797D83] uppercase tracking-wide">Ziel-Makros für diese Mahlzeit</p>
            <p className="text-[10px] text-[#555A61]">kcal = P×4 + K×4 + F×9 (automatisch)</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Kcal — readonly, ergibt sich aus Makros */}
            <div>
              <label className="block text-xs text-[#797D83] mb-1">Kalorien (kcal)</label>
              <div className="w-full px-3 py-2 border border-white/[0.06] bg-white/[0.02] rounded-lg text-sm text-[#EDECEA] font-semibold">
                {Math.round(
                  (meal.target_protein ?? 0) * 4 +
                  (meal.target_carbs   ?? 0) * 4 +
                  (meal.target_fat     ?? 0) * 9
                )}
              </div>
            </div>
            {[
              { label: 'Protein (g)',   key: 'target_protein' as const, kcalPerG: 4 },
              { label: 'Kohlenhy. (g)', key: 'target_carbs'   as const, kcalPerG: 4 },
              { label: 'Fett (g)',      key: 'target_fat'     as const, kcalPerG: 9 },
            ].map(f => {
              const grams = meal[f.key] ?? 0
              return (
                <div key={f.key}>
                  <label className="block text-xs text-[#797D83] mb-1">{f.label}</label>
                  <input
                    type="number" min={0}
                    value={grams}
                    onChange={e => {
                      const v = Number(e.target.value) || 0
                      const next = { ...meal, [f.key]: v }
                      const kcal = Math.round(
                        (next.target_protein ?? 0) * 4 +
                        (next.target_carbs   ?? 0) * 4 +
                        (next.target_fat     ?? 0) * 9
                      )
                      onChange({ [f.key]: v, target_kcal: kcal })
                    }}
                    className="w-full px-3 py-2 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-lg text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent"
                  />
                  <p className="text-[10px] text-[#555A61] mt-1">{Math.round(grams * f.kcalPerG)} kcal</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Erlaubte Kategorien */}
        <div>
          <p className="text-xs font-semibold text-[#797D83] uppercase tracking-wide mb-2">Erlaubte Lebensmittel-Kategorien</p>
          <p className="text-xs text-[#555A61] mb-2">Aus welchen Kategorien darf der Kunde für diese Mahlzeit Lebensmittel wählen?</p>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_CATEGORIES.map(cat => {
              const on = allowed.has(cat)
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    on
                      ? `${CAT_BADGE[cat]} border-transparent`
                      : 'bg-white/[0.03] border-white/[0.08] text-[#555A61] hover:text-[#797D83]'
                  }`}
                >
                  {on ? '✓ ' : ''}{CAT_LABEL[cat]}
                </button>
              )
            })}
          </div>

          {/* Gemüse-Gramm — nur wenn aktiviert */}
          {allowed.has('vegetable') && (
            <div className="mt-3 flex items-center gap-3 bg-green-500/[0.06] border border-green-500/20 rounded-lg px-3 py-2">
              <label className="text-xs font-medium text-[#797D83] flex-1">Gemüse-Menge für diese Mahlzeit (g)</label>
              <input
                type="number" min={0}
                value={meal.target_vegetable_g ?? 0}
                onChange={e => onChange({ target_vegetable_g: Number(e.target.value) || 0 })}
                className="w-24 px-3 py-1.5 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-lg text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent"
              />
              <span className="text-xs text-[#555A61]">g</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NutritionEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [name, setName] = useState(''); const [desc, setDesc] = useState('')
  const [goal, setGoal] = useState<NutritionGoal>('maintain')
  const [tCal, setTCal] = useState('2000'); const [tP, setTP] = useState('150')
  const [tK, setTK] = useState('200');   const [tF, setTF] = useState('70')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')

  const [meals, setMeals] = useState<NutritionMeal[]>([])
  const [addingMeal, setAddingMeal] = useState(false)
  const [newMealName, setNewMealName] = useState('')

  const [clients, setClients] = useState<Client[]>([])
  const [assigned, setAssigned] = useState<AssignedRow[]>([])
  const [assignClientId, setAssignClientId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const newMealRef = useRef<HTMLInputElement>(null)
  const DEFERRED_WRITE_MESSAGE = 'Diese Aktion wird im nächsten Migrationsschritt auf das Backend umgestellt.'

  const showDeferredWriteMessage = (target: 'settings' | 'assign' | 'all' = 'all') => {
    if (target === 'settings' || target === 'all') {
      setSettingsMsg(DEFERRED_WRITE_MESSAGE)
      setTimeout(() => setSettingsMsg(''), 4000)
    }
    if (target === 'assign' || target === 'all') {
      setAssignMsg(DEFERRED_WRITE_MESSAGE)
      setTimeout(() => setAssignMsg(''), 4000)
    }
  }

  // ─── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch(`/api/backend/nutrition/plans/${id}`, {
        method: 'GET',
        cache: 'no-store',
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            plan?: {
              id: string
              name: string
              description: string | null
              createdAt: string
            }
            meals?: Array<{
              id: string
              planId: string
              name: string
              description: string | null
              sortOrder: number
              createdAt: string
            }>
            assignments?: Array<{
              id: string
              clientId: string
              active: boolean
              client: { id: string; fullName: string; email: string | null }
            }>
            clients?: Array<{
              id: string
              fullName: string
              email: string | null
            }>
            message?: string
          }
        | null

      if (!response.ok) {
        if (response.status === 401) {
          setLoadError('Backend-Login erforderlich.')
        } else if (response.status === 404) {
          router.push('/admin/nutrition')
          return
        } else {
          setLoadError(payload?.message ?? 'Fehler beim Laden.')
        }
        setPlan(null)
        setMeals([])
        setClients([])
        setAssigned([])
        return
      }

      if (!payload?.plan) {
        setLoadError('Fehler beim Laden.')
        setPlan(null)
        setMeals([])
        setClients([])
        setAssigned([])
        return
      }

      const planData: NutritionPlan = {
        id: payload.plan.id,
        trainer_id: '',
        name: payload.plan.name,
        description: payload.plan.description,
        goal: 'maintain',
        target_calories: 2000,
        target_protein: 150,
        target_carbs: 200,
        target_fat: 70,
        created_at: payload.plan.createdAt,
      }

      setPlan(planData)
      setName(payload.plan.name)
      setDesc(payload.plan.description ?? '')
      setGoal('maintain')
      setTCal('2000')
      setTP('150')
      setTK('200')
      setTF('70')

      const mappedMeals: NutritionMeal[] = (payload.meals ?? []).map((meal) => ({
        id: meal.id,
        plan_id: meal.planId,
        name: meal.name,
        sort_order: meal.sortOrder,
        target_kcal: 0,
        target_protein: 0,
        target_carbs: 0,
        target_fat: 0,
        target_vegetable_g: 0,
        allowed_categories: ['protein', 'carbs', 'fat', 'vegetable'],
        created_at: meal.createdAt,
      }))
      setMeals(mappedMeals)

      const mappedClients: Client[] = (payload.clients ?? []).map((client) => ({
        id: client.id,
        trainer_id: '',
        user_id: null,
        full_name: client.fullName,
        email: client.email ?? '',
        phone: null,
        notes: null,
        created_at: '',
      }))
      setClients(mappedClients)

      const mappedAssignments: AssignedRow[] = (payload.assignments ?? []).map((row) => ({
        id: row.id,
        client_id: row.clientId,
        is_active: row.active,
        client: {
          id: row.client.id,
          full_name: row.client.fullName,
          email: row.client.email,
        },
      }))
      setAssigned(mappedAssignments)
    } catch {
      setLoadError('Fehler beim Laden.')
      setPlan(null)
      setMeals([])
      setClients([])
      setAssigned([])
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  // ─── Plan settings ────────────────────────────────────────────────────────

  const saveSettings = async () => {
    if (!name.trim()) {
      setSettingsMsg('Name ist erforderlich.')
      return
    }
    setSavingSettings(true)
    setSettingsMsg('')
    try {
      const response = await fetch(`/api/backend/nutrition/plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSettingsMsg(payload?.message ?? 'Fehler beim Speichern.')
        setSavingSettings(false)
        return
      }
      const updated = payload?.plan as { id: string; name: string; description: string | null; createdAt: string; updatedAt: string } | undefined
      if (updated) {
        setPlan((prev) => prev ? { ...prev, name: updated.name, description: updated.description } : prev)
        setName(updated.name)
        setDesc(updated.description ?? '')
      }
      setSettingsMsg('✓ Gespeichert')
      setTimeout(() => setSettingsMsg(''), 3000)
    } catch {
      setSettingsMsg('Backend nicht erreichbar.')
    } finally {
      setSavingSettings(false)
    }
  }

  // ─── Meals ────────────────────────────────────────────────────────────────

  const addMeal = async () => {
    if (!newMealName.trim()) return
    try {
      const response = await fetch(`/api/backend/nutrition/plans/${id}/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMealName.trim() }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSettingsMsg(payload?.message ?? 'Fehler beim Hinzufügen.')
        return
      }
      const backendMeal = payload?.meal as { id: string; planId: string; name: string; description: string | null; sortOrder: number; createdAt: string } | undefined
      if (backendMeal) {
        const newMeal: NutritionMeal = {
          id: backendMeal.id,
          plan_id: backendMeal.planId,
          name: backendMeal.name,
          sort_order: backendMeal.sortOrder,
          target_kcal: 0,
          target_protein: 0,
          target_carbs: 0,
          target_fat: 0,
          target_vegetable_g: 0,
          allowed_categories: ['protein', 'carbs', 'fat', 'vegetable'],
          created_at: backendMeal.createdAt,
        }
        setMeals((prev) => [...prev, newMeal])
      }
      setNewMealName('')
      setAddingMeal(false)
    } catch {
      setSettingsMsg('Backend nicht erreichbar.')
    }
  }

  // distributeRest writes to macro target fields not stored in backend — deferred.
  const distributeRest = async (
    targets: Array<'protein' | 'carbs' | 'fat'>,
  ) => {
    void targets
    if (meals.length === 0) return
    showDeferredWriteMessage('settings')
  }

  const updateMeal = async (mealId: string, patch: Partial<NutritionMeal>) => {
    // Fields supported by backend
    const backendBody: Record<string, unknown> = {}
    if (patch.name !== undefined) backendBody.name = patch.name
    if (patch.sort_order !== undefined) backendBody.sortOrder = patch.sort_order

    // Update local state immediately (UI-only fields like target_protein are display-only)
    setMeals((prev) => prev.map((m) => m.id === mealId ? { ...m, ...patch } : m))

    if (Object.keys(backendBody).length === 0) return

    try {
      const response = await fetch(`/api/backend/nutrition/meals/${mealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendBody),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSettingsMsg(payload?.message ?? 'Fehler beim Aktualisieren.')
        return
      }
      const backendMeal = payload?.meal as { name: string; sortOrder: number } | undefined
      if (backendMeal) {
        setMeals((prev) => prev.map((m) => m.id === mealId ? { ...m, name: backendMeal.name, sort_order: backendMeal.sortOrder } : m))
      }
    } catch {
      setSettingsMsg('Backend nicht erreichbar.')
    }
  }

  const deleteMeal = async (mid: string) => {
    if (!confirm('Mahlzeit löschen?')) return
    try {
      const response = await fetch(`/api/backend/nutrition/meals/${mid}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setSettingsMsg(payload?.message ?? 'Fehler beim Löschen.')
        return
      }
      setMeals((prev) => prev.filter((m) => m.id !== mid))
    } catch {
      setSettingsMsg('Backend nicht erreichbar.')
    }
  }

  // ─── Assignment ───────────────────────────────────────────────────────────

  const assignPlan = async () => {
    if (!assignClientId) return
    setAssigning(true)
    setAssignMsg('')
    try {
      const response = await fetch(`/api/backend/nutrition/plans/${id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: assignClientId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setAssignMsg(payload?.message ?? 'Fehler beim Zuweisen.')
        return
      }
      setAssignClientId('')
      await load()
    } catch {
      setAssignMsg('Backend nicht erreichbar.')
    } finally {
      setAssigning(false)
    }
  }

  const toggleAssignment = async (rowId: string, current: boolean) => {
    try {
      const response = await fetch(`/api/backend/nutrition/assignments/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !current }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setAssignMsg(payload?.message ?? 'Fehler beim Aktualisieren.')
        return
      }
      const updated = payload?.assignment as { id: string; active: boolean } | undefined
      if (updated) {
        setAssigned((prev) =>
          prev.map((a) => a.id === rowId ? { ...a, is_active: updated.active } : a),
        )
      }
    } catch {
      setAssignMsg('Backend nicht erreichbar.')
    }
  }

  const removeAssignment = async (rowId: string) => {
    try {
      const response = await fetch(`/api/backend/nutrition/assignments/${rowId}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setAssignMsg(payload?.message ?? 'Fehler beim Entfernen.')
        return
      }
      setAssigned((prev) => prev.filter((a) => a.id !== rowId))
    } catch {
      setAssignMsg('Backend nicht erreichbar.')
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────

  const ms = macroSum(meals)
  const numTCal = Number(tCal) || 1, numTP = Number(tP) || 1
  const numTK = Number(tK) || 1, numTF = Number(tF) || 1

  if (loading) return (
    <div className="p-8 flex justify-center">
      <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (loadError) return <div className="p-8 text-sm text-red-400">{loadError}</div>
  if (!plan) return null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Back + DB link */}
      <div className="flex items-center justify-between">
        <Link href="/admin/nutrition" className="flex items-center gap-1.5 text-sm text-[#797D83] hover:text-[#EDECEA] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Alle Pläne
        </Link>
        <Link href="/admin/nutrition/foods" className="text-sm text-[#A78BFA] hover:text-[#B79FFB] font-medium transition-colors">
          🥦 Lebensmittel-DB verwalten
        </Link>
      </div>

      {/* ── PLAN SETTINGS ──────────────────────────────────────────────────── */}
      <div className="bg-[#111318] rounded-2xl border border-white/[0.06] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Plan-Einstellungen</h2>
          <div className="flex items-center gap-3">
            {settingsMsg && (
              <span className={`text-xs font-medium ${settingsMsg.startsWith('✓') ? 'text-[#A78BFA]' : 'text-red-400'}`}>
                {settingsMsg}
              </span>
            )}
            <button onClick={saveSettings} disabled={savingSettings}
              className="px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
              {savingSettings ? '…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#797D83] mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#797D83] mb-1.5">Ziel</label>
            <select value={goal} onChange={e => setGoal(e.target.value as NutritionGoal)}
              className="w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent">
              {(['cut', 'bulk', 'maintain'] as NutritionGoal[]).map(g =>
                <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Kalorien (kcal)', val: tCal, set: setTCal },
            { label: 'Protein (g)',     val: tP,   set: setTP },
            { label: 'Kohlenhy. (g)',   val: tK,   set: setTK },
            { label: 'Fett (g)',        val: tF,   set: setTF },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-xs font-medium text-[#797D83] mb-1.5">{f.label}</label>
              <input type="number" min={0} value={f.val} onChange={e => f.set(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* ── MAHLZEITEN-MAKRO-SUMME vs PLAN-TARGET ──────────────────────────── */}
      <div className="bg-[#111318] rounded-2xl border border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-white">Verteilung der Mahlzeiten</h2>
          {meals.length > 0 && (() => {
            const dP = (Number(tP) || 0) - ms.p
            const dK = (Number(tK) || 0) - ms.k
            const dF = (Number(tF) || 0) - ms.f
            const anyDiff = Math.abs(dP) >= 1 || Math.abs(dK) >= 1 || Math.abs(dF) >= 1
            if (!anyDiff) return null
            return (
              <button
                onClick={() => distributeRest(['protein', 'carbs', 'fat'])}
                className="text-xs px-3 py-1.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] font-semibold rounded-lg transition-colors"
                title="Verteilt offene/überzählige Makros gleichmäßig auf alle Mahlzeiten"
              >
                Rest auf Mahlzeiten verteilen
              </button>
            )
          })()}
        </div>
        <p className="text-xs text-[#555A61] mb-4">Summe der Mahlzeit-Ziele vs. Tages-Ziel. Pro Makro &bdquo;verteilen&ldquo; klicken oder oben Rest komplett auf alle Mahlzeiten gleichmäßig verteilen lassen.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { key: 'kcal'    as const, label: 'Kalorien', cur: ms.cal, max: numTCal, unit: 'kcal', color: '#f97316' },
            { key: 'protein' as const, label: 'Protein',  cur: ms.p,   max: numTP,   unit: 'g',    color: '#3b82f6' },
            { key: 'carbs'   as const, label: 'Kohlenh.', cur: ms.k,   max: numTK,   unit: 'g',    color: '#22c55e' },
            { key: 'fat'     as const, label: 'Fett',     cur: ms.f,   max: numTF,   unit: 'g',    color: '#eab308' },
          ].map(m => {
            const diff = m.max - m.cur
            const canDistribute = m.key !== 'kcal' && meals.length > 0 && Math.abs(diff) >= 1
            return (
              <div key={m.label} className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[#797D83]">{m.label}</span>
                  <span className="text-[#555A61]">{m.max}{m.unit}</span>
                </div>
                <MacroBar value={m.cur} max={m.max} color={m.color} />
                <div className="flex justify-between">
                  <span className="text-sm font-bold text-white">{Math.round(m.cur)}{m.unit}</span>
                  <span className={`text-xs font-medium ${diff < 0 ? 'text-red-400' : 'text-[#555A61]'}`}>
                    {diff < 0 ? `+${Math.abs(Math.round(diff))} über` : diff === 0 ? '✓' : `${Math.round(diff)} offen`}
                  </span>
                </div>
                {canDistribute && (
                  <button
                    onClick={() => distributeRest([m.key as 'protein' | 'carbs' | 'fat'])}
                    className="w-full text-[10px] px-2 py-1 bg-white/[0.04] hover:bg-[#A78BFA]/10 text-[#797D83] hover:text-[#A78BFA] border border-white/[0.06] hover:border-[#A78BFA]/30 rounded-md transition-colors"
                    title={`${diff > 0 ? '+' : ''}${(diff / meals.length).toFixed(1)}${m.unit} pro Mahlzeit`}
                  >
                    {diff > 0 ? '↓ verteilen' : '↑ reduzieren'} ({(diff / meals.length).toFixed(1)}{m.unit}/Mahlzeit)
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MEALS ──────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="font-semibold text-white">Mahlzeiten ({meals.length})</h2>

        {meals.map(meal => (
          <MealEditor
            key={meal.id}
            meal={meal}
            onChange={(patch) => updateMeal(meal.id, patch)}
            onDelete={() => deleteMeal(meal.id)}
          />
        ))}

        {addingMeal ? (
          <div className="bg-[#111318] rounded-2xl border border-white/[0.06] p-4 flex gap-2">
            <input
              ref={newMealRef}
              autoFocus
              value={newMealName}
              onChange={e => setNewMealName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMeal(); if (e.key === 'Escape') { setAddingMeal(false); setNewMealName('') } }}
              placeholder="z.B. Frühstück, Mittagessen…"
              className="flex-1 px-3 py-2 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent" />
            <button onClick={() => { setAddingMeal(false); setNewMealName('') }} className="px-3 py-2 border border-white/[0.08] text-[#797D83] text-sm rounded-xl hover:bg-white/[0.04] transition-colors">Abbrechen</button>
            <button onClick={addMeal} disabled={!newMealName.trim()} className="px-4 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">Hinzufügen</button>
          </div>
        ) : (
          <button onClick={() => setAddingMeal(true)} className="w-full py-3 border-2 border-dashed border-white/[0.08] hover:border-[#A78BFA]/40 text-[#555A61] hover:text-[#A78BFA] text-sm font-medium rounded-2xl transition-colors">
            + Mahlzeit hinzufügen
          </button>
        )}
      </div>

      {/* ── ASSIGNMENT ─────────────────────────────────────────────────────── */}
      <div className="bg-[#111318] rounded-2xl border border-white/[0.06] p-6">
        <h2 className="font-semibold text-white mb-4">Kunden zuweisen</h2>
        {assignMsg && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${
            assignMsg.startsWith('✓')
              ? 'bg-[#A78BFA]/10 text-[#A78BFA] border-[#A78BFA]/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {assignMsg}
          </div>
        )}
        <div className="flex gap-3 mb-4">
          <select value={assignClientId} onChange={e => setAssignClientId(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-[#0b0c0f] border border-white/[0.08] text-white rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/50 focus:border-transparent">
            <option value="">Kunden auswählen…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <button onClick={assignPlan} disabled={!assignClientId || assigning}
            className="px-4 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
            {assigning ? '…' : 'Zuweisen'}
          </button>
        </div>
        {assigned.length === 0 ? (
          <p className="text-sm text-[#555A61]">Noch keinem Kunden zugewiesen.</p>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {assigned.map(a => (
              <li key={a.id} className="flex items-center gap-4 py-3">
                <div className="w-8 h-8 rounded-full bg-[#A78BFA]/20 flex items-center justify-center text-[#A78BFA] text-sm font-bold flex-shrink-0">
                  {a.client?.full_name?.charAt(0) ?? '?'}
                </div>
                <div className="flex-1 text-sm font-medium text-white">{a.client?.full_name ?? '–'}</div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  a.is_active
                    ? 'bg-[#A78BFA]/10 text-[#A78BFA]'
                    : 'bg-white/[0.04] text-[#555A61]'
                }`}>
                  {a.is_active ? 'Aktiv' : 'Inaktiv'}
                </span>
                <button onClick={() => toggleAssignment(a.id, a.is_active)} className="text-xs text-[#797D83] hover:text-white px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors">
                  {a.is_active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button onClick={() => removeAssignment(a.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
