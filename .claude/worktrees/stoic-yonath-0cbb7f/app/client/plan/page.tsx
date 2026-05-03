'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { AssignedPlan, WorkoutPlan, WorkoutDay } from '@/lib/types'

export default function ClientPlanPage() {
  const [plans, setPlans] = useState<(AssignedPlan & { plan: WorkoutPlan & { workout_days: WorkoutDay[] } })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: client } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (!client) { setLoading(false); return }

      const { data } = await supabase
        .from('assigned_plans')
        .select('*, plan:workout_plans(*, workout_days(*))')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })

      setPlans((data ?? []) as (AssignedPlan & { plan: WorkoutPlan & { workout_days: WorkoutDay[] } })[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Mein Training</h1>

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm">Kein aktiver Trainingsplan vorhanden.</p>
          <p className="text-gray-400 text-xs mt-1">Dein Trainer wird dir bald einen Plan zuweisen.</p>
        </div>
      ) : (
        plans.map(ap => {
          const sortedDays = [...(ap.plan.workout_days ?? [])].sort((a, b) => a.sort_order - b.sort_order)
          return (
            <div key={ap.id} className="mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-emerald-600">
                  <h2 className="font-bold text-white">{ap.plan.name}</h2>
                  {ap.plan.description && <p className="text-emerald-100 text-sm mt-0.5">{ap.plan.description}</p>}
                  <p className="text-emerald-200 text-xs mt-2">{sortedDays.length} Trainingstag{sortedDays.length !== 1 ? 'e' : ''}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {sortedDays.map((day, i) => (
                    <Link
                      key={day.id}
                      href={`/client/plan/${day.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{day.name}</div>
                        {day.description && <div className="text-xs text-gray-500 truncate">{day.description}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Training starten</span>
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
