'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { AssignedPlan, WorkoutPlan, WorkoutDay } from '@/lib/types'

export default function ClientPlanPage() {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)

  const [plans, setPlans] = useState<(AssignedPlan & { plan: WorkoutPlan & { workout_days: WorkoutDay[] } })[]>([])
  const [completedDayIds, setCompletedDayIds] = useState<Set<string>>(new Set())
  const [activeDayIds, setActiveDayIds] = useState<Set<string>>(new Set())
  const [menuOpenDayId, setMenuOpenDayId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: client } = await supabase
        .from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (!client) { setLoading(false); return }

      // Monday of current week
      const now = new Date()
      const dayOfWeek = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      monday.setHours(0, 0, 0, 0)
      const weekStart = monday.toISOString().split('T')[0]

      const [plansRes, weekLogsRes, activeLogsRes] = await Promise.all([
        supabase
          .from('assigned_plans')
          .select('*, plan:workout_plans(*, workout_days(*))')
          .eq('client_id', client.id)
          .eq('is_active', true)
          .order('assigned_at', { ascending: false }),
        supabase
          .from('workout_logs')
          .select('day_id')
          .eq('client_id', client.id)
          .not('completed_at', 'is', null)
          .gte('date', weekStart),
        supabase
          .from('workout_logs')
          .select('day_id')
          .eq('client_id', client.id)
          .is('completed_at', null),
      ])

      // Deduplizieren: gleicher Plan darf nur einmal erscheinen
      const all = (plansRes.data ?? []) as (AssignedPlan & { plan: WorkoutPlan & { workout_days: WorkoutDay[] } })[]
      const seen = new Set<string>()
      const unique = all.filter(ap => {
        if (seen.has(ap.plan_id)) return false
        seen.add(ap.plan_id)
        return true
      })
      setPlans(unique)
      setCompletedDayIds(new Set((weekLogsRes.data ?? []).map(r => r.day_id)))
      setActiveDayIds(new Set((activeLogsRes.data ?? []).map(r => r.day_id)))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Mein Training</h1>

      {/* Close menu on outside click */}
      {menuOpenDayId && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenDayId(null)} />
      )}

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm">Kein aktiver Trainingsplan vorhanden.</p>
          <p className="text-gray-400 text-xs mt-1">Dein Trainer wird dir bald einen Plan zuweisen.</p>
        </div>
      ) : (
        plans.map(ap => {
          const sortedDays = [...(ap.plan.workout_days ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)

          return (
            <div key={ap.id} className="mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Plan header */}
                <div className="px-5 pt-5 pb-3 border-b border-gray-100">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Aktueller Plan</p>
                  <h2 className="font-bold text-gray-900 mt-0.5">{ap.plan.name}</h2>
                </div>

                {/* Days */}
                <div className="p-3 space-y-1">
                  {sortedDays.map(day => {
                    const isActive = activeDayIds.has(day.id)
                    const isDone   = !isActive && completedDayIds.has(day.id)

                    const rowBg  = isActive ? 'bg-blue-50' : isDone ? 'bg-emerald-50' : 'hover:bg-gray-50'
                    const iconBg = isActive ? 'bg-blue-500 text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-lg'
                    const menuLabel  = isActive ? 'Fortsetzen' : isDone ? 'Nochmal starten' : 'Training starten'
                    const menuIcon   = isActive ? '▶️' : isDone ? '🔁' : '▶️'
                    const menuTarget = `/client/workout/${day.id}/play${isDone ? '?fresh=1' : ''}`

                    return (
                      <div key={day.id} className="relative">
                        <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${rowBg}`}>
                          {/* Row — navigates to preview */}
                          <button
                            onClick={() => router.push(`/client/plan/${day.id}`)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors ${iconBg}`}>
                              {isActive
                                ? <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                                  </span>
                                : isDone
                                  ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  : '💪'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm">{day.name}</div>
                              {isActive
                                ? <div className="text-xs text-blue-600 mt-0.5 font-medium">Läuft gerade</div>
                                : isDone
                                  ? <div className="text-xs text-emerald-600 mt-0.5 font-medium">Diese Woche erledigt</div>
                                  : day.description
                                    ? <div className="text-xs text-gray-400 truncate">{day.description}</div>
                                    : null}
                            </div>
                          </button>

                          {/* 3-dot menu */}
                          <button
                            onClick={e => { e.stopPropagation(); setMenuOpenDayId(menuOpenDayId === day.id ? null : day.id) }}
                            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 flex-shrink-0 relative z-20"
                            aria-label="Optionen"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="5" r="1.5" />
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="12" cy="19" r="1.5" />
                            </svg>
                          </button>
                        </div>

                        {/* Dropdown */}
                        {menuOpenDayId === day.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-2 top-12 z-30 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[170px]"
                          >
                            <button
                              onClick={() => { router.push(menuTarget); setMenuOpenDayId(null) }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <span>{menuIcon}</span>
                              {menuLabel}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
