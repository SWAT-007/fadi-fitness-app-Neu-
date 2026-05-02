'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { NutritionPlan } from '@/lib/types'

const GOAL_LABEL: Record<string, string> = {
  cut: 'Abnehmen',
  bulk: 'Muskelaufbau',
  maintain: 'Erhaltung',
}
const GOAL_COLOR: Record<string, string> = {
  cut: 'bg-blue-50 text-blue-700',
  bulk: 'bg-orange-50 text-orange-700',
  maintain: 'bg-green-50 text-green-700',
}

type PlanWithCount = NutritionPlan & { assigned_count: number }

export default function NutritionListPage() {
  const [plans, setPlans] = useState<PlanWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('nutrition_plans')
      .select('*, assigned_nutrition_plans(id, is_active)')
      .eq('trainer_id', user.id)
      .order('created_at', { ascending: false })

    const enriched = (data ?? []).map((p: NutritionPlan & { assigned_nutrition_plans: Array<{ is_active: boolean }> }) => ({
      ...p,
      assigned_count: (p.assigned_nutrition_plans ?? []).filter((a) => a.is_active).length,
    }))

    setPlans(enriched as PlanWithCount[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Ernährungsplan wirklich löschen? Alle Mahlzeiten und Zuweisungen werden entfernt.')) return
    setDeleting(id)
    await supabase.from('nutrition_plans').delete().eq('id', id)
    await load()
    setDeleting(null)
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ernährungspläne</h1>
          <p className="text-sm text-gray-500 mt-0.5">Erstelle und verwalte Ernährungspläne für deine Kunden</p>
        </div>
        <Link
          href="/admin/nutrition/new"
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Neuer Plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
          <div className="text-5xl mb-4">🥗</div>
          <h3 className="text-gray-700 font-semibold mb-1">Noch keine Ernährungspläne</h3>
          <p className="text-sm text-gray-400 mb-5">Erstelle deinen ersten Plan für einen Kunden.</p>
          <Link
            href="/admin/nutrition/new"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Ersten Plan erstellen
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <div
              key={plan.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-4 p-5">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-xl flex-shrink-0">
                  🥗
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${GOAL_COLOR[plan.goal]}`}>
                      {GOAL_LABEL[plan.goal]}
                    </span>
                    {plan.assigned_count > 0 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        {plan.assigned_count} Kunde{plan.assigned_count !== 1 ? 'n' : ''} aktiv
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{plan.target_calories} kcal</span>
                    <span>{plan.target_protein}g P</span>
                    <span>{plan.target_carbs}g K</span>
                    <span>{plan.target_fat}g F</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/nutrition/${plan.id}`}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    Bearbeiten
                  </Link>
                  <button
                    onClick={() => handleDelete(plan.id)}
                    disabled={deleting === plan.id}
                    className="px-3 py-2 text-red-500 hover:text-red-600 hover:bg-red-50 text-sm rounded-xl transition-colors disabled:opacity-50"
                  >
                    {deleting === plan.id ? '…' : 'Löschen'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
