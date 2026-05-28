'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Profile, Client, AssignedPlan, WorkoutPlan, WorkoutDay, ProgressLog } from '@/lib/types'
import { AnimatedNumber, StaggerItem, SuccessButton, useToast } from '@/components/Motion'

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  flame: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 3s4 4.5 4 8.5a4 4 0 11-8 0c0-1.5.7-2.7 1.5-3.5C9 11 11 12 12 14c1-3-1-5 0-11z" /></svg>,
  scale: <svg viewBox="0 0 24 24" {...stroke}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M8 6V4h8v2" /><path d="M9 13h6M12 10v6" /></svg>,
  arrow: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 5l7 7-7 7" /></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>,
  check: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>,
  refresh: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 12a8 8 0 0114-5.3L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 01-14 5.3L4 16" /><path d="M4 20v-4h4" /></svg>,
  trend: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>,
  chat: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 3.5V17H6a2 2 0 01-2-2V6z" /></svg>,
  dumbbell: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" /></svg>,
  clock: <svg viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 5v14M5 12h14" /></svg>,
}

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
  const { showToast } = useToast()
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
  const [hasWeeklyCheckin, setHasWeeklyCheckin] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const menuRef = useRef<HTMLDivElement>(null)

  const [weightOpen, setWeightOpen] = useState(false)
  const [weightInput, setWeightInput] = useState('')
  const [weightSaving, setWeightSaving] = useState(false)
  const [weightSaved, setWeightSaved] = useState(false)

  interface DashboardPayload {
    client?: {
      id: string
      fullName: string
      email: string
      trainerId: string
    } | null
    activePlan?: {
      id: string
      planId: string
      plan: {
        id: string
        name: string
        days: WorkoutDay[]
      }
    } | null
    workoutStats?: {
      completedCount: number
      completedThisWeekDayIds: string[]
      activeDayIds: string[]
      monthlyWorkouts: Array<{ id: string; durationSeconds: number | null; date: string; completedAt: string | null }>
    }
    latestProgressLog?: {
      id: string
      date: string
      bodyWeight: number | null
      notes?: string | null
    } | null
    hasCurrentWeekCheckin?: boolean
    unreadMessageCount?: number
    message?: string
  }

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/backend/me/dashboard', {
          method: 'GET',
          cache: 'no-store',
        })

        if (response.status === 401) {
          router.replace('/login')
          return
        }
        if (response.status === 403) {
          router.replace('/admin')
          return
        }

        const payload = await response.json().catch(() => null) as DashboardPayload | null
        if (!response.ok || !payload?.client) {
          setLoading(false)
          return
        }

        const clientData: Client = {
          id: payload.client.id,
          trainer_id: payload.client.trainerId,
          full_name: payload.client.fullName,
          email: payload.client.email,
          created_at: '',
        }
        setClient(clientData)
        setProfile({
          id: payload.client.id,
          email: payload.client.email,
          full_name: payload.client.fullName,
          role: 'client',
          created_at: '',
        })

        if (payload.activePlan?.plan) {
          const mappedPlan: WorkoutPlan = {
            id: payload.activePlan.plan.id,
            trainer_id: payload.client.trainerId,
            name: payload.activePlan.plan.name,
            created_at: '',
          }
          setActivePlan(mappedPlan)
          setPlanDays((payload.activePlan.plan.days ?? []).sort((a, b) => a.sort_order - b.sort_order))
        }

        const completedIds = payload.workoutStats?.completedThisWeekDayIds ?? []
        const activeIds = payload.workoutStats?.activeDayIds ?? []
        const monthlyWorkouts = payload.workoutStats?.monthlyWorkouts ?? []
        const weekStart = (() => {
          const now = new Date()
          const dayOfWeek = now.getDay()
          const monday = new Date(now)
          monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
          monday.setHours(0, 0, 0, 0)
          return monday.toISOString().split('T')[0]
        })()
        const weekMonthlySubset = monthlyWorkouts.filter(log => log.date >= weekStart)

        setTotalWorkouts(payload.workoutStats?.completedCount ?? 0)
        setCompletedDayIds(new Set(completedIds))
        setActiveDayIds(new Set(activeIds))
        setWeeklyStats({
          workouts: weekMonthlySubset.length,
          seconds: weekMonthlySubset.reduce((sum, log) => sum + (log.durationSeconds ?? 0), 0),
        })
        setMonthlyStats({
          workouts: monthlyWorkouts.length,
          seconds: monthlyWorkouts.reduce((sum, log) => sum + (log.durationSeconds ?? 0), 0),
        })
        setHasWeeklyCheckin(Boolean(payload.hasCurrentWeekCheckin))
        setUnreadMessageCount(payload.unreadMessageCount ?? 0)

        setLastWeight(payload.latestProgressLog
          ? {
              id: payload.latestProgressLog.id,
              client_id: payload.client.id,
              date: payload.latestProgressLog.date,
              body_weight: payload.latestProgressLog.bodyWeight,
              notes: payload.latestProgressLog.notes ?? null,
              created_at: '',
            }
          : null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const handleSaveWeight = async () => {
    if (!client || !weightInput) return
    setWeightSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const response = await fetch('/api/backend/me/progress-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, bodyWeight: parseFloat(weightInput) }),
    })
    const payload = await response.json().catch(() => null) as {
      progressLog?: { id: string; date: string; bodyWeight: number | null; notes?: string | null }
    } | null
    if (response.ok && payload?.progressLog) {
      setLastWeight({
        id: payload.progressLog.id,
        client_id: client.id,
        date: payload.progressLog.date,
        body_weight: payload.progressLog.bodyWeight,
        notes: payload.progressLog.notes ?? null,
        created_at: '',
      })
    }
    setWeightInput('')
    setWeightOpen(false)
    setWeightSaving(false)
    setWeightSaved(true)
    showToast('Gewicht gespeichert ✓', 'success')
    window.setTimeout(() => setWeightSaved(false), 1500)
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 11) return 'Guten Morgen'
    if (h < 18) return 'Hallo'
    return 'Guten Abend'
  })()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Athlet'
  const weeklyGoal = 4
  const weeklyProgressPct = Math.min(100, Math.round((weeklyStats.workouts / weeklyGoal) * 100))
  const trainingStatusText = !activePlan
    ? 'Kein aktiver Plan'
    : activeDayIds.size > 0
      ? 'Workout läuft'
      : completedDayIds.size > 0
        ? `${completedDayIds.size} Tag(e) erledigt`
        : 'Noch kein Workout'

  if (loading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="px-4 pt-4 pb-8 max-w-lg mx-auto">
      {/* Hero — gradient greeting card with weekly progress ring */}
      <div className="relative overflow-hidden rounded-3xl mb-4 p-5 text-white bg-gradient-to-br from-[#0b0c0f] via-[#111318] to-[#1a1d24] shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
        <span className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-emerald-500/20 blur-3xl" />
        <span className="pointer-events-none absolute right-12 bottom-0 w-28 h-28 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-white/50">{greeting}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight leading-tight">{firstName}</h1>
            <p className="text-white/60 text-[13px] mt-1.5">
              {weeklyStats.workouts === 0
                ? 'Bereit für dein erstes Training diese Woche?'
                : `${weeklyStats.workouts} von ${weeklyGoal} Trainings diese Woche.`}
            </p>
          </div>
          <ProgressRing pct={weeklyProgressPct} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Trainings gesamt"
          value={<AnimatedNumber value={totalWorkouts} />}
          accent="from-emerald-500/10 to-transparent"
          iconBg="bg-emerald-50" iconColor="text-emerald-600"
          icon={Icon.flame}
        />
        <StatCard
          label="Letztes Gewicht"
          value={lastWeight?.body_weight
            ? <><AnimatedNumber value={lastWeight.body_weight} decimals={1} /><span className="text-base font-medium text-gray-500 ml-1">kg</span></>
            : <span className="text-gray-400">–</span>}
          accent="from-violet-500/10 to-transparent"
          iconBg="bg-violet-50" iconColor="text-violet-600"
          icon={Icon.scale}
        />
      </div>

      {/* Active plan */}
      {!client ? (
        <EmptyCard icon={Icon.dumbbell} text="Dein Kundenkonto ist noch nicht mit deinem Trainer verbunden." />
      ) : !activePlan ? (
        <EmptyCard icon={Icon.dumbbell} text="Dir wurde noch kein Trainingsplan zugewiesen." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] mb-4 overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
            <div>
              <p className="text-[11px] text-gray-500 font-medium uppercase tracking-[0.12em]">Aktueller Plan</p>
              <h2 className="font-semibold text-gray-900 mt-0.5 tracking-tight">{activePlan.name}</h2>
            </div>
            <Link
              href="/client/plan"
              className="press inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 -mr-1 rounded-lg hover:bg-emerald-50"
            >
              Alle Tage <span className="w-3.5 h-3.5">{Icon.arrow}</span>
            </Link>
          </div>
          <div className="p-2.5 space-y-1">
            {menuOpenDayId && (
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpenDayId(null)} />
            )}
            {planDays.map((day, index) => {
              const isActive = activeDayIds.has(day.id)
              const isDone = !isActive && completedDayIds.has(day.id)
              const rowBg = isActive
                ? 'bg-blue-50/70 hover:bg-blue-50'
                : isDone
                  ? 'bg-emerald-50/60 hover:bg-emerald-50'
                  : 'hover:bg-gray-50'
              const iconBg = isActive
                ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                : isDone
                  ? 'bg-emerald-500 text-white ring-2 ring-emerald-200'
                  : 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200/60'

              return (
                <StaggerItem key={day.id} index={index} className={`relative ${menuOpenDayId === day.id ? 'z-40' : 'z-0'}`}>
                  <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${rowBg}`}>
                    <button
                      onClick={() => router.push(`/client/plan/${day.id}`)}
                      className="press flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                        {isActive
                          ? <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                            </span>
                          : isDone
                            ? <span className="w-5 h-5 block">{Icon.check}</span>
                            : <span className="w-5 h-5 block">{Icon.dumbbell}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-[14px] tracking-tight">{day.name}</div>
                        {isActive
                          ? <div className="text-[11.5px] text-blue-600 mt-0.5 font-medium">Läuft gerade</div>
                          : isDone
                            ? <div className="text-[11.5px] text-emerald-600 mt-0.5 font-medium">Diese Woche erledigt</div>
                            : day.description && <div className="text-[11.5px] text-gray-400 truncate mt-0.5">{day.description}</div>
                        }
                      </div>
                    </button>

                    {isActive ? (
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/client/workout/${day.id}/play`) }}
                        className="press flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-semibold flex-shrink-0"
                      >
                        <span className="w-3 h-3">{Icon.play}</span>
                        Weiter
                      </button>
                    ) : isDone ? (
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpenDayId(menuOpenDayId === day.id ? null : day.id) }}
                        className="press p-1.5 rounded-lg hover:bg-white/70 text-gray-400 flex-shrink-0 relative z-20"
                        aria-label="Optionen"
                      >
                        <span className="w-4 h-4 block">{Icon.dots}</span>
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/client/workout/${day.id}/play`) }}
                        className="press flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-[12px] font-semibold flex-shrink-0 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]"
                      >
                        <span className="w-3 h-3">{Icon.play}</span>
                        Starten
                      </button>
                    )}
                  </div>

                  {isDone && menuOpenDayId === day.id && (
                    <div ref={menuRef} className="absolute right-2 top-12 z-30 bg-white rounded-xl shadow-lg border border-gray-200/70 py-1 min-w-[170px]">
                      <button
                        onClick={() => { router.push(`/client/workout/${day.id}/play?fresh=1`); setMenuOpenDayId(null) }}
                        className="press w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <span className="w-4 h-4 text-gray-500">{Icon.refresh}</span>
                        Nochmal starten
                      </button>
                    </div>
                  )}
                </StaggerItem>
              )
            })}
          </div>
        </div>
      )}

      {/* Analyse */}
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] mb-4 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-gray-100">
          <span className="w-4 h-4 text-gray-400">{Icon.trend}</span>
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-[0.12em]">Fortschritt</p>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2.5">
          <AnalyseTile label="Diese Woche" sub="Trainings" icon={Icon.dumbbell} value={<AnimatedNumber value={weeklyStats.workouts} />} accent="from-emerald-500/10" />
          <AnalyseTile label="Diese Woche" sub="Trainingszeit" icon={Icon.clock} value={formatDuration(weeklyStats.seconds)} accent="from-blue-500/10" />
          <AnalyseTile label="Dieser Monat" sub="Trainings" icon={Icon.dumbbell} value={<AnimatedNumber value={monthlyStats.workouts} />} accent="from-violet-500/10" />
          <AnalyseTile label="Dieser Monat" sub="Trainingszeit" icon={Icon.clock} value={formatDuration(monthlyStats.seconds)} accent="from-orange-500/10" />
        </div>
      </div>

      {/* Diese Woche */}
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] mb-4 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-[0.12em]">Diese Woche</p>
        </div>
        <div className="px-5 py-3 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-600">Training</span>
            <span className="font-medium text-gray-900">{trainingStatusText}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-600">Check-in</span>
            <span className={`font-medium ${hasWeeklyCheckin ? 'text-emerald-700' : 'text-amber-700'}`}>
              {hasWeeklyCheckin ? 'Erledigt' : 'Offen'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setWeightInput(''); setWeightOpen(true) }}
          className="lift press group relative overflow-hidden rounded-2xl p-4 text-left text-white bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 shadow-[0_8px_24px_-12px_rgba(16,185,129,0.6)]"
        >
          <span className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/15 blur-2xl" />
          <div className="relative w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center mb-3">
            <span className="w-4.5 h-4.5 block">{Icon.plus}</span>
          </div>
          <div className="relative font-semibold text-[14px] tracking-tight">Gewicht eintragen</div>
          <div className="relative text-emerald-50/85 text-[12px] mt-0.5">Heute, {new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</div>
        </button>
        <Link
          href="/client/messages"
          className="lift press group rounded-2xl p-4 bg-white border border-gray-200/70 hover:border-gray-300/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.12)]"
        >
          <div className="w-9 h-9 rounded-xl bg-gray-50 ring-1 ring-inset ring-black/5 flex items-center justify-center text-gray-700 mb-3">
            <span className="w-5 h-5 block">{Icon.chat}</span>
          </div>
          <div className="font-semibold text-[14px] text-gray-900 tracking-tight">Trainer schreiben</div>
          <div className="text-gray-500 text-[12px] mt-0.5">Frage stellen oder Update</div>
          {unreadMessageCount > 0 && (
            <div className="mt-2 inline-flex min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold items-center justify-center">
              {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
            </div>
          )}
        </Link>
      </div>

      {/* Gewicht-Modal */}
      {weightOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm motion-page-fade">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 tracking-tight">Gewicht eintragen</h2>
              {lastWeight?.body_weight && (
                <p className="text-[12px] text-gray-400 mt-0.5">Letzter Eintrag: {lastWeight.body_weight} kg</p>
              )}
            </div>
            <div className="px-5 py-4">
              <label className="block text-[13px] font-medium text-gray-700 mb-2">
                Aktuelles Gewicht (kg)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                placeholder="z.B. 72.5"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveWeight()}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-semibold text-center tabular-nums focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setWeightOpen(false)}
                className="press flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 text-[13px]"
              >
                Abbrechen
              </button>
              <SuccessButton
                onClick={handleSaveWeight}
                disabled={!weightInput || weightSaving}
                success={weightSaved}
                className="press flex-1 py-3 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 text-white font-semibold rounded-xl text-[13px] shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]"
              >
                {weightSaving ? 'Speichern…' : 'Speichern'}
              </SuccessButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <div className="relative shrink-0 w-14 h-14" aria-label={`${pct}% der Wochenziele`}>
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56" width="56" height="56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.23, 1, 0.32, 1)' }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="56" y2="56">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-semibold tabular-nums text-white">{pct}%</span>
      </div>
    </div>
  )
}

function StatCard({
  label, value, accent, iconBg, iconColor, icon,
}: { label: string; value: ReactNode; accent: string; iconBg: string; iconColor: string; icon: ReactNode }) {
  return (
    <div className="lift relative overflow-hidden bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-4">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} to-transparent`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[24px] font-semibold text-gray-900 tracking-tight tabular-nums leading-none">{value}</div>
          <div className="text-[11.5px] text-gray-500 mt-2">{label}</div>
        </div>
        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${iconBg} ${iconColor} ring-1 ring-inset ring-black/5`}>
          <span className="w-4 h-4 block">{icon}</span>
        </div>
      </div>
    </div>
  )
}

function AnalyseTile({
  label, sub, icon, value, accent,
}: { label: string; sub: string; icon: ReactNode; value: ReactNode; accent: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gray-50 p-3 ring-1 ring-inset ring-black/[0.03]`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} to-transparent`} />
      <div className="relative flex items-center gap-1.5 text-gray-400">
        <span className="w-3.5 h-3.5">{icon}</span>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em]">{label}</span>
      </div>
      <div className="relative text-[20px] font-semibold text-gray-900 tracking-tight tabular-nums mt-1.5 leading-none">{value}</div>
      <div className="relative text-[11.5px] text-gray-400 mt-1">{sub}</div>
    </div>
  )
}

function EmptyCard({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-6 text-center mb-4">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-50 ring-1 ring-inset ring-black/5 flex items-center justify-center text-gray-400 mb-3">
        <span className="w-6 h-6 block">{icon}</span>
      </div>
      <p className="text-gray-600 text-[13px]">{text}</p>
    </div>
  )
}
