'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAdminEmail } from '@/lib/admin'
import { supabase } from '@/lib/supabase'
import type { Profile, Client, AssignedPlan, WorkoutPlan, WorkoutDay, ProgressLog } from '@/lib/types'

function formatDuration(seconds: number): string {
  if (seconds === 0) return '–'
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

export default function ClientDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null)
  const [planDays, setPlanDays] = useState<WorkoutDay[]>([])
  const [lastWeight, setLastWeight] = useState<ProgressLog | null>(null)
  const [totalWorkouts, setTotalWorkouts] = useState(0)
  const [completedDayIds, setCompletedDayIds] = useState<Set<string>>(new Set())
  const [activeDayIds, setActiveDayIds] = useState<Set<string>>(new Set())
  const [menuOpenDayId, setMenuOpenDayId] = useState<string | null>(null)
  const [weeklyStats, setWeeklyStats] = useState({ workouts: 0, seconds: 0 })
  const [monthlyStats, setMonthlyStats] = useState({ workouts: 0, seconds: 0 })
  const [loading, setLoading] = useState(true)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (isAdminEmail(user.email)) { router.replace('/admin'); return }

      const { data: cl } = await supabase.from('clients').select('*').eq('user_id', user.id).maybeSingle()
      if (!cl) { setLoading(false); return }
      setClient(cl)

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      // Monday of current week
      const now = new Date()
      const dayOfWeek = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      monday.setHours(0, 0, 0, 0)
      const weekStart = monday.toISOString().split('T')[0]
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

      const [assignedRes, logsCountRes, progressRes, weekLogsRes, activeLogsRes, analyseLogsRes] = await Promise.all([
        supabase.from('assigned_plans').select('*, plan:workout_plans(*, workout_days(*))').eq('client_id', cl.id).eq('is_active', true).order('assigned_at', { ascending: false }).limit(1),
        supabase.from('workout_logs').select('id', { count: 'exact', head: true }).eq('client_id', cl.id).not('completed_at', 'is', null),
        supabase.from('progress_logs').select('*').eq('client_id', cl.id).order('date', { ascending: false }).limit(1),
        supabase.from('workout_logs').select('day_id').eq('client_id', cl.id).not('completed_at', 'is', null).gte('date', weekStart),
        supabase.from('workout_logs').select('day_id').eq('client_id', cl.id).is('completed_at', null),
        supabase.from('workout_logs').select('id, duration_seconds, date').eq('client_id', cl.id).not('completed_at', 'is', null).gte('date', monthStart),
      ])

      const assigned = assignedRes.data?.[0] as (AssignedPlan & { plan: WorkoutPlan & { workout_days: WorkoutDay[] } }) | undefined
      if (assigned?.plan) {
        setActivePlan(assigned.plan)
        setPlanDays(assigned.plan.workout_days?.sort((a, b) => a.sort_order - b.sort_order) ?? [])
      }
      setTotalWorkouts(logsCountRes.count ?? 0)
      setLastWeight(progressRes.data?.[0] ?? null)
      setCompletedDayIds(new Set((weekLogsRes.data ?? []).map(r => r.day_id)))
      setActiveDayIds(new Set((activeLogsRes.data ?? []).map(r => r.day_id)))

      const analyseLogs = (analyseLogsRes.data ?? []) as Array<{ duration_seconds: number | null; date: string }>
      const weekAnalyseLogs = analyseLogs.filter(l => l.date >= weekStart)
      setWeeklyStats({
        workouts: weekAnalyseLogs.length,
        seconds: weekAnalyseLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0),
      })
      setMonthlyStats({
        workouts: analyseLogs.length,
        seconds: analyseLogs.reduce((s, l) => s + (l.duration_seconds ?? 0), 0),
      })

      setLoading(false)
    }
    load()
  }, [router])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Guten Morgen'
    if (h < 18) return 'Guten Tag'
    return 'Guten Abend'
  }

  if (loading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Greeting */}
      <div className="mt-2 mb-6">
        <p className="text-gray-500 text-sm">{greeting()},</p>
        <h1 className="text-2xl font-bold text-gray-900">{profile?.full_name ?? 'Athlet'} 👋</h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{totalWorkouts}</div>
          <div className="text-xs text-gray-500 mt-0.5">Trainings gesamt</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">
            {lastWeight?.body_weight ? `${lastWeight.body_weight} kg` : '–'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Letztes Gewicht</div>
        </div>
      </div>

      {/* Active plan */}
      {!client ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
          <div className="text-4xl mb-3">🏋️</div>
          <p className="text-gray-500 text-sm">Dein Kundenkonto ist noch nicht mit deinem Trainer verbunden.</p>
        </div>
      ) : !activePlan ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-500 text-sm">Dir wurde noch kein Trainingsplan zugewiesen.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
          <div className="px-5 pt-5 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Aktueller Plan</p>
                <h2 className="font-bold text-gray-900 mt-0.5">{activePlan.name}</h2>
              </div>
              <Link href="/client/plan" className="text-xs text-emerald-600 hover:underline font-medium">Alle Tage</Link>
            </div>
          </div>
          <div className="p-3 space-y-1">
            {/* Close menu on outside click */}
            {menuOpenDayId && (
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpenDayId(null)} />
            )}
            {planDays.map(day => {
              const isActive = activeDayIds.has(day.id)
              const isDone = !isActive && completedDayIds.has(day.id)

              const rowBg = isActive ? 'bg-blue-50' : isDone ? 'bg-emerald-50' : 'hover:bg-gray-50'
              const iconBg = isActive ? 'bg-blue-500 text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-lg'
              const menuLabel = isActive ? 'Fortsetzen' : isDone ? 'Nochmal starten' : 'Training starten'
              const menuIcon = isActive ? '▶️' : isDone ? '🔁' : '▶️'
              const menuTarget = `/client/workout/${day.id}/play${isDone ? '?fresh=1' : ''}`

              return (
                <div key={day.id} className="relative">
                  <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${rowBg}`}>
                    {/* Row — navigates to detail */}
                    <button
                      onClick={() => router.push(`/client/plan/${day.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold transition-colors ${iconBg}`}>
                        {isActive
                          ? <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-white" /></span>
                          : isDone
                            ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            : '💪'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">{day.name}</div>
                        {isActive
                          ? <div className="text-xs text-blue-600 mt-0.5 font-medium">Läuft gerade</div>
                          : isDone
                            ? <div className="text-xs text-emerald-600 mt-0.5 font-medium">Diese Woche erledigt</div>
                            : day.description && <div className="text-xs text-gray-400 truncate">{day.description}</div>
                        }
                      </div>
                    </button>

                    {/* 3-dot menu */}
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpenDayId(menuOpenDayId === day.id ? null : day.id) }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 flex-shrink-0 relative z-20"
                      aria-label="Optionen"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                  </div>

                  {/* Dropdown */}
                  {menuOpenDayId === day.id && (
                    <div ref={menuRef} className="absolute right-2 top-12 z-30 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[170px]">
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
      )}

      {/* Analyse */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Analyse</p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">Diese Woche</div>
            <div className="text-xl font-bold text-gray-900">{weeklyStats.workouts}</div>
            <div className="text-xs text-gray-400 mt-0.5">Trainings</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">Diese Woche</div>
            <div className="text-xl font-bold text-gray-900">{formatDuration(weeklyStats.seconds)}</div>
            <div className="text-xs text-gray-400 mt-0.5">Trainingszeit</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">Dieser Monat</div>
            <div className="text-xl font-bold text-gray-900">{monthlyStats.workouts}</div>
            <div className="text-xs text-gray-400 mt-0.5">Trainings</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">Dieser Monat</div>
            <div className="text-xl font-bold text-gray-900">{formatDuration(monthlyStats.seconds)}</div>
            <div className="text-xs text-gray-400 mt-0.5">Trainingszeit</div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/client/progress" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl p-4 transition-colors">
          <div className="text-2xl mb-2">📈</div>
          <div className="font-semibold text-sm">Gewicht eintragen</div>
        </Link>
        <Link href="/client/messages" className="bg-white border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 transition-colors">
          <div className="text-2xl mb-2">💬</div>
          <div className="font-semibold text-sm text-gray-900">Trainer schreiben</div>
        </Link>
      </div>
    </div>
  )
}
