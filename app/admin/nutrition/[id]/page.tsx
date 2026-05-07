'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  type Client, type FoodCategory,
  type NutritionGoal, type NutritionMeal, type NutritionPlan,
} from '@/lib/types'

// ─── Local types ──────────────────────────────────────────────────────────────

type AssignedRow = {
  id: string
  client_id: string
  is_active: boolean
  client: { id: string; full_name: string }
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
  protein:   'bg-blue-100 text-blue-700',
  carbs:     'bg-orange-100 text-orange-700',
  fat:       'bg-yellow-100 text-yellow-700',
  vegetable: 'bg-green-100 text-green-700',
  fruit:     'bg-pink-100 text-pink-700',
  dairy:     'bg-purple-100 text-purple-700',
  other:     'bg-gray-100 text-gray-600',
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
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <input
          defaultValue={meal.name}
          onBlur={e => onChange({ name: e.target.value.trim() || meal.name })}
          className="flex-1 font-semibold text-gray-900 bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-green-500 rounded-lg px-2 py-0.5 -ml-2"
        />
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Ziel-Makros — Trainer gibt P/K/F ein, kcal wird automatisch berechnet */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ziel-Makros für diese Mahlzeit</p>
            <p className="text-[10px] text-gray-400">kcal = P×4 + K×4 + F×9 (automatisch)</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Kcal — readonly, ergibt sich aus Makros */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kalorien (kcal)</label>
              <div className="w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-700 font-semibold">
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
                  <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">{Math.round(grams * f.kcalPerG)} kcal</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Erlaubte Kategorien */}
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Erlaubte Lebensmittel-Kategorien</p>
          <p className="text-xs text-gray-400 mb-2">Aus welchen Kategorien darf der Kunde für diese Mahlzeit Lebensmittel wählen?</p>
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
                      : 'bg-white border-gray-200 text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {on ? '✓ ' : ''}{CAT_LABEL[cat]}
                </button>
              )
            })}
          </div>

          {/* Gemüse-Gramm — nur wenn aktiviert */}
          {allowed.has('vegetable') && (
            <div className="mt-3 flex items-center gap-3 bg-green-50/60 border border-green-100 rounded-lg px-3 py-2">
              <label className="text-xs font-medium text-gray-700 flex-1">Gemüse-Menge für diese Mahlzeit (g)</label>
              <input
                type="number" min={0}
                value={meal.target_vegetable_g ?? 0}
                onChange={e => onChange({ target_vegetable_g: Number(e.target.value) || 0 })}
                className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <span className="text-xs text-gray-400">g</span>
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

  const newMealRef = useRef<HTMLInputElement>(null)

  // ─── Load ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [planRes, mealsRes, clientsRes, assignedRes] = await Promise.all([
      supabase.from('nutrition_plans').select('*').eq('id', id).single(),
      supabase.from('nutrition_meals').select('*').eq('plan_id', id).order('sort_order'),
      supabase.from('clients').select('*').eq('trainer_id', user.id).order('full_name'),
      supabase.from('assigned_nutrition_plans').select('id, client_id, is_active, client:clients(id, full_name)').eq('plan_id', id),
    ])

    if (!planRes.data) { router.push('/admin/nutrition'); return }

    const p = planRes.data as NutritionPlan
    setPlan(p); setName(p.name); setDesc(p.description ?? '')
    setGoal(p.goal); setTCal(String(p.target_calories))
    setTP(String(p.target_protein)); setTK(String(p.target_carbs)); setTF(String(p.target_fat))

    setMeals((mealsRes.data ?? []) as NutritionMeal[])
    setClients(clientsRes.data ?? [])
    setAssigned((assignedRes.data ?? []) as unknown as AssignedRow[])

    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  // ─── Plan settings ────────────────────────────────────────────────────────

  const saveSettings = async () => {
    setSavingSettings(true); setSettingsMsg('')
    const { error } = await supabase.from('nutrition_plans').update({
      name: name.trim(), description: desc.trim() || null, goal,
      target_calories: Number(tCal) || 2000, target_protein: Number(tP) || 150,
      target_carbs: Number(tK) || 200, target_fat: Number(tF) || 70,
    }).eq('id', id)
    setSavingSettings(false)
    setSettingsMsg(error ? `Fehler: ${error.message}` : '✓ Gespeichert')
    setTimeout(() => setSettingsMsg(''), 3000)
  }

  // ─── Meals ────────────────────────────────────────────────────────────────

  const addMeal = async () => {
    if (!newMealName.trim()) return
    const { data, error } = await supabase.from('nutrition_meals').insert({
      plan_id: id, name: newMealName.trim(), sort_order: meals.length,
      target_kcal: 0, target_protein: 0, target_carbs: 0, target_fat: 0,
      target_vegetable_g: 0,
      allowed_categories: ['protein', 'carbs', 'fat'],
    }).select('*').single()
    if (error) {
      console.error('[meal create]', error)
      alert(`Fehler: ${error.message}\n\nFalls die Spalten target_* fehlen, führe migration_macro_meals.sql aus.`)
      return
    }
    setMeals(prev => [...prev, data as NutritionMeal])
    setNewMealName(''); setAddingMeal(false)
  }

  // Verteilt die noch offenen (oder über-verteilten) Makros gleichmäßig auf
  // alle Mahlzeiten. „Rest" = Tages-Ziel − Summe der Mahlzeit-Ziele.
  // mode = 'all' rührt P/K/F gemeinsam an. Per-Makro-Buttons rufen mit der
  // jeweiligen Auswahl auf.
  const distributeRest = async (
    targets: Array<'protein' | 'carbs' | 'fat'>,
  ) => {
    if (meals.length === 0) return
    const dailyP = Number(tP) || 0
    const dailyK = Number(tK) || 0
    const dailyF = Number(tF) || 0
    const sumP = meals.reduce((s, m) => s + (m.target_protein ?? 0), 0)
    const sumK = meals.reduce((s, m) => s + (m.target_carbs   ?? 0), 0)
    const sumF = meals.reduce((s, m) => s + (m.target_fat     ?? 0), 0)
    const diffP = targets.includes('protein') ? (dailyP - sumP) / meals.length : 0
    const diffK = targets.includes('carbs')   ? (dailyK - sumK) / meals.length : 0
    const diffF = targets.includes('fat')     ? (dailyF - sumF) / meals.length : 0

    const updates = meals.map(m => {
      const p = Math.max(0, Math.round((m.target_protein ?? 0) + diffP))
      const k = Math.max(0, Math.round((m.target_carbs   ?? 0) + diffK))
      const f = Math.max(0, Math.round((m.target_fat     ?? 0) + diffF))
      const kcal = Math.round(p * 4 + k * 4 + f * 9)
      return { ...m, target_protein: p, target_carbs: k, target_fat: f, target_kcal: kcal }
    })

    setMeals(updates)
    await Promise.all(updates.map(m =>
      supabase.from('nutrition_meals').update({
        target_protein: m.target_protein,
        target_carbs:   m.target_carbs,
        target_fat:     m.target_fat,
        target_kcal:    m.target_kcal,
      }).eq('id', m.id)
    ))
  }

  const updateMeal = async (mealId: string, patch: Partial<NutritionMeal>) => {
    setMeals(prev => prev.map(m => m.id === mealId ? { ...m, ...patch } : m))
    const { error } = await supabase.from('nutrition_meals').update(patch).eq('id', mealId)
    if (error) {
      console.warn('[meal update]', error)
      // Spalten fehlen → klar an User melden, sonst „verschwindet" der Wert
      // einfach beim nächsten Reload und Bug ist unsichtbar.
      if (/column.*does not exist|schema cache/i.test(error.message)) {
        alert(
          `Speichern fehlgeschlagen: Spalte fehlt in der Datenbank.\n\n` +
          `${error.message}\n\n` +
          `Lösung — im Supabase SQL-Editor ausführen:\n\n` +
          `alter table nutrition_meals add column if not exists target_vegetable_g numeric not null default 0;`
        )
      }
    }
  }

  const deleteMeal = async (mid: string) => {
    if (!confirm('Mahlzeit löschen?')) return
    await supabase.from('nutrition_meals').delete().eq('id', mid)
    setMeals(prev => prev.filter(m => m.id !== mid))
  }

  // ─── Assignment ───────────────────────────────────────────────────────────

  const assignPlan = async () => {
    if (!assignClientId) return
    setAssigning(true); setAssignMsg('')
    const payload = { client_id: assignClientId, plan_id: id, is_active: true }
    const previousAssignment = assigned.find(row => row.client_id === assignClientId)
    const { error } = await supabase
      .from('assigned_nutrition_plans')
      .upsert(payload, { onConflict: 'client_id,plan_id' })
      .select('*')
    if (error) {
      setAssignMsg(`Fehler: ${error.message}`)
    } else {
      const cli = clients.find(c => c.id === assignClientId)
      const linkedRes = await supabase.from('clients').select('user_id').eq('id', assignClientId).single()
      if (!linkedRes.data?.user_id) {
        setAssignMsg(`✓ Zugewiesen — aber „${cli?.full_name}" hat noch kein Konto. Sobald sich der Kunde mit „${cli?.email}" registriert, wird der Plan sichtbar.`)
      } else {
        if (!previousAssignment?.is_active) {
          await supabase.from('notifications').insert({
            client_id: linkedRes.data.user_id,
            type: 'nutrition_plan',
            title: 'Neuer Ernährungsplan zugewiesen',
            body: plan?.name ?? null,
          })
        }
        setAssignMsg(`✓ Plan an „${cli?.full_name}" zugewiesen.`)
      }
      setAssignClientId('')
      await load()
    }
    setAssigning(false)
    setTimeout(() => setAssignMsg(''), 6000)
  }

  const toggleAssignment = async (rowId: string, current: boolean) => {
    await supabase.from('assigned_nutrition_plans').update({ is_active: !current }).eq('id', rowId)
    setAssigned(prev => prev.map(a => a.id === rowId ? { ...a, is_active: !current } : a))
  }

  const removeAssignment = async (rowId: string) => {
    await supabase.from('assigned_nutrition_plans').delete().eq('id', rowId)
    setAssigned(prev => prev.filter(a => a.id !== rowId))
  }

  // ─── Derived ─────────────────────────────────────────────────────────────

  const ms = macroSum(meals)
  const numTCal = Number(tCal) || 1, numTP = Number(tP) || 1
  const numTK = Number(tK) || 1, numTF = Number(tF) || 1

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!plan) return null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Back + DB link */}
      <div className="flex items-center justify-between">
        <Link href="/admin/nutrition" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Alle Pläne
        </Link>
        <Link href="/admin/nutrition/foods" className="text-sm text-green-600 hover:text-green-700 font-medium">
          🥦 Lebensmittel-DB verwalten
        </Link>
      </div>

      {/* ── PLAN SETTINGS ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Plan-Einstellungen</h2>
          <div className="flex items-center gap-3">
            {settingsMsg && <span className={`text-xs font-medium ${settingsMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{settingsMsg}</span>}
            <button onClick={saveSettings} disabled={savingSettings}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
              {savingSettings ? '…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Ziel</label>
            <select value={goal} onChange={e => setGoal(e.target.value as NutritionGoal)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent">
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{f.label}</label>
              <input type="number" min={0} value={f.val} onChange={e => f.set(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </div>
          ))}
        </div>
      </div>

      {/* ── MAHLZEITEN-MAKRO-SUMME vs PLAN-TARGET ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Verteilung der Mahlzeiten</h2>
          {meals.length > 0 && (() => {
            const dP = (Number(tP) || 0) - ms.p
            const dK = (Number(tK) || 0) - ms.k
            const dF = (Number(tF) || 0) - ms.f
            const anyDiff = Math.abs(dP) >= 1 || Math.abs(dK) >= 1 || Math.abs(dF) >= 1
            if (!anyDiff) return null
            return (
              <button
                onClick={() => distributeRest(['protein', 'carbs', 'fat'])}
                className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                title="Verteilt offene/überzählige Makros gleichmäßig auf alle Mahlzeiten"
              >
                Rest auf Mahlzeiten verteilen
              </button>
            )
          })()}
        </div>
        <p className="text-xs text-gray-400 mb-4">Summe der Mahlzeit-Ziele vs. Tages-Ziel. Pro Makro &bdquo;verteilen&ldquo; klicken oder oben Rest komplett auf alle Mahlzeiten gleichmäßig verteilen lassen.</p>
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
                  <span className="text-gray-500">{m.label}</span>
                  <span className="text-gray-400">{m.max}{m.unit}</span>
                </div>
                <MacroBar value={m.cur} max={m.max} color={m.color} />
                <div className="flex justify-between">
                  <span className="text-sm font-bold text-gray-900">{Math.round(m.cur)}{m.unit}</span>
                  <span className={`text-xs font-medium ${diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {diff < 0 ? `+${Math.abs(Math.round(diff))} über` : diff === 0 ? '✓' : `${Math.round(diff)} offen`}
                  </span>
                </div>
                {canDistribute && (
                  <button
                    onClick={() => distributeRest([m.key as 'protein' | 'carbs' | 'fat'])}
                    className="w-full text-[10px] px-2 py-1 bg-gray-50 hover:bg-green-50 text-gray-600 hover:text-green-700 border border-gray-200 hover:border-green-300 rounded-md transition-colors"
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
        <h2 className="font-semibold text-gray-900">Mahlzeiten ({meals.length})</h2>

        {meals.map(meal => (
          <MealEditor
            key={meal.id}
            meal={meal}
            onChange={(patch) => updateMeal(meal.id, patch)}
            onDelete={() => deleteMeal(meal.id)}
          />
        ))}

        {addingMeal ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 flex gap-2 shadow-sm">
            <input
              ref={newMealRef}
              autoFocus
              value={newMealName}
              onChange={e => setNewMealName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMeal(); if (e.key === 'Escape') { setAddingMeal(false); setNewMealName('') } }}
              placeholder="z.B. Frühstück, Mittagessen…"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            <button onClick={() => { setAddingMeal(false); setNewMealName('') }} className="px-3 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Abbrechen</button>
            <button onClick={addMeal} disabled={!newMealName.trim()} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">Hinzufügen</button>
          </div>
        ) : (
          <button onClick={() => setAddingMeal(true)} className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-green-400 hover:bg-green-50 text-gray-500 hover:text-green-600 text-sm font-medium rounded-2xl transition-colors">
            + Mahlzeit hinzufügen
          </button>
        )}
      </div>

      {/* ── ASSIGNMENT ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Kunden zuweisen</h2>
        {assignMsg && (
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${
            assignMsg.startsWith('✓')
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {assignMsg}
          </div>
        )}
        <div className="flex gap-3 mb-4">
          <select value={assignClientId} onChange={e => setAssignClientId(e.target.value)}
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent">
            <option value="">Kunden auswählen…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <button onClick={assignPlan} disabled={!assignClientId || assigning}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors">
            {assigning ? '…' : 'Zuweisen'}
          </button>
        </div>
        {assigned.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keinem Kunden zugewiesen.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {assigned.map(a => (
              <li key={a.id} className="flex items-center gap-4 py-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold flex-shrink-0">
                  {a.client?.full_name?.charAt(0) ?? '?'}
                </div>
                <div className="flex-1 text-sm font-medium text-gray-900">{a.client?.full_name ?? '–'}</div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {a.is_active ? 'Aktiv' : 'Inaktiv'}
                </span>
                <button onClick={() => toggleAssignment(a.id, a.is_active)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100">
                  {a.is_active ? 'Deaktivieren' : 'Aktivieren'}
                </button>
                <button onClick={() => removeAssignment(a.id)} className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
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
