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

const withErrorId = (message: string, errorId?: string) =>
  errorId ? `${message} (Fehler-ID: ${errorId})` : message

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
    errorId?: string
  }

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/backend/me/dashboard', { method: 'GET', cache: 'no-store' })
        if (response.status === 401) { router.replace('/login'); return }
        if (response.status === 403) { router.replace('/admin'); return }

        const payload = await response.json().catch(() => null) as DashboardPayload | null
        if (!response.ok || !payload?.client) {
          showToast(withErrorId(payload?.message ?? 'Dashboard-Daten konnten nicht geladen werden.', payload?.errorId), 'danger')
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
        setProfile({ id: payload.client.id, email: payload.client.email, full_name: payload.client.fullName, role: 'client', created_at: '' })

        if (payload.activePlan?.plan) {
          setActivePlan({ id: payload.activePlan.plan.id, trainer_id: payload.client.trainerId, name: payload.activePlan.plan.name, created_at: '' })
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
        setWeeklyStats({ workouts: weekMonthlySubset.length, seconds: weekMonthlySubset.reduce((s, l) => s + (l.durationSeconds ?? 0), 0) })
        setMonthlyStats({ workouts: monthlyWorkouts.length, seconds: monthlyWorkouts.reduce((s, l) => s + (l.durationSeconds ?? 0), 0) })
        setHasWeeklyCheckin(Boolean(payload.hasCurrentWeekCheckin))
        setUnreadMessageCount(payload.unreadMessageCount ?? 0)
        setLastWeight(payload.latestProgressLog
          ? { id: payload.latestProgressLog.id, client_id: payload.client.id, date: payload.latestProgressLog.date, body_weight: payload.latestProgressLog.bodyWeight, notes: payload.latestProgressLog.notes ?? null, created_at: '' }
          : null)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Netzwerkfehler beim Laden.', 'danger')
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
      message?: string
      errorId?: string
    } | null
    if (!response.ok) {
      setWeightSaving(false)
      showToast(withErrorId(payload?.message ?? 'Gewicht konnte nicht gespeichert werden.', payload?.errorId), 'danger')
      return
    }
    if (payload?.progressLog) {
      setLastWeight({ id: payload.progressLog.id, client_id: client.id, date: payload.progressLog.date, body_weight: payload.progressLog.bodyWeight, notes: payload.progressLog.notes ?? null, created_at: '' })
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
    : activeDayIds.size > 0 ? 'Workout läuft'
    : completedDayIds.size > 0 ? `${completedDayIds.size} Tag(e) erledigt`
    : 'Noch kein Workout'

  if (loading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="px-4 pt-4 pb-8 max-w-lg mx-auto">

      {/* Hero greeting card */}
      <div className="relative overflow-hidden rounded-3xl mb-4 p-5 bg-[#111111] border border-white/[0.06] shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6)]">
        <span className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-[#A78BFA]/10 blur-3xl" />
        <span className="pointer-events-none absolute right-12 bottom-0 w-28 h-28 rounded-full bg-[#A78BFA]/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-[#797D83]">{greeting}</p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight leading-tight text-[#EDECEA]">{firstName}</h1>
            <p className="text-[#797D83] text-[13px] mt-1.5">
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
        <DarkStatCard
          label="Trainings gesamt"
          value={<AnimatedNumber value={totalWorkouts} />}
          icon={Icon.flame}
        />
        <DarkStatCard
          label="Letztes Gewicht"
          value={lastWeight?.body_weight
            ? <><AnimatedNumber value={lastWeight.body_weight} decimals={1} /><span className="text-base font-medium text-[#797D83] ml-1">kg</span></>
            : <span className="text-[#797D83]">–</span>}
          icon={Icon.scale}
        />
      </div>

      {/* Active plan */}
      {!client ? (
        <DarkEmptyCard icon={Icon.dumbbell} text="Dein Kundenkonto ist noch nicht mit deinem Trainer verbunden." />
      ) : !activePlan ? (
        <DarkEmptyCard icon={Icon.dumbbell} text="Dir wurde noch kein Trainingsplan zugewiesen." />
      ) : (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] mb-4 overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.04]">
            <div>
              <p className="text-[11px] text-[#797D83] font-medium uppercase tracking-[0.12em]">Aktueller Plan</p>
              <h2 className="font-bold text-[#EDECEA] mt-0.5 tracking-tight">{activePlan.name}</h2>
            </div>
            <Link
              href="/client/plan"
              className="press inline-flex items-center gap-1 text-[12.5px] font-medium text-[#A78BFA] hover:text-[#B79FFB] px-2 py-1 -mr-1 rounded-lg hover:bg-[#A78BFA]/[0.08]"
            >
              Alle Tage <span className="w-3.5 h-3.5">{Icon.arrow}</span>
            </Link>
          </div>
          <div className="p-2.5 space-y-1">
            {menuOpenDayId && <div className="fixed inset-0 z-10" onClick={() => setMenuOpenDayId(null)} />}
            {planDays.map((day, index) => {
              const isActive = activeDayIds.has(day.id)
              const isDone = !isActive && completedDayIds.has(day.id)
              const rowBg = isActive ? 'bg-[#A78BFA]/[0.08]' : isDone ? 'bg-white/[0.03]' : 'hover:bg-white/[0.03]'

              return (
                <StaggerItem key={day.id} index={index} className={`relative ${menuOpenDayId === day.id ? 'z-40' : 'z-0'}`}>
                  <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${rowBg}`}>
                    <button
                      onClick={() => router.push(`/client/plan/${day.id}`)}
                      className="press flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-[#A78BFA] text-[#050504]'
                        : isDone ? 'bg-white/[0.08] text-[#A78BFA]'
                        : 'bg-white/[0.06] text-[#797D83]'
                      }`}>
                        {isActive
                          ? <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#050504] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#050504]" />
                            </span>
                          : isDone
                            ? <span className="w-5 h-5 block">{Icon.check}</span>
                            : <span className="w-5 h-5 block">{Icon.dumbbell}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#EDECEA] text-[14px] tracking-tight">{day.name}</div>
                        {isActive
                          ? <div className="text-[11.5px] text-[#A78BFA] mt-0.5 font-medium">Läuft gerade</div>
                          : isDone
                            ? <div className="text-[11.5px] text-[#797D83] mt-0.5">Diese Woche erledigt</div>
                            : day.description && <div className="text-[11.5px] text-[#797D83] truncate mt-0.5">{day.description}</div>
                        }
                      </div>
                    </button>

                    {isActive ? (
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/client/workout/${day.id}/play`) }}
                        className="press flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[12px] font-bold flex-shrink-0"
                      >
                        <span className="w-3 h-3">{Icon.play}</span>
                        Weiter
                      </button>
                    ) : isDone ? (
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpenDayId(menuOpenDayId === day.id ? null : day.id) }}
                        className="press p-1.5 rounded-lg hover:bg-white/[0.06] text-[#797D83] flex-shrink-0 relative z-20"
                        aria-label="Optionen"
                      >
                        <span className="w-4 h-4 block">{Icon.dots}</span>
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/client/workout/${day.id}/play`) }}
                        className="press flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[12px] font-bold flex-shrink-0 shadow-[0_4px_12px_-4px_rgba(167,139,250,0.4)]"
                      >
                        <span className="w-3 h-3">{Icon.play}</span>
                        Starten
                      </button>
                    )}
                  </div>

                  {isDone && menuOpenDayId === day.id && (
                    <div ref={menuRef} className="absolute right-2 top-12 z-30 bg-[#181818] rounded-xl shadow-2xl border border-white/[0.08] py-1 min-w-[170px]">
                      <button
                        onClick={() => { router.push(`/client/workout/${day.id}/play?fresh=1`); setMenuOpenDayId(null) }}
                        className="press w-full text-left px-4 py-2.5 text-[13px] text-[#EDECEA] hover:bg-white/[0.04] flex items-center gap-2"
                      >
                        <span className="w-4 h-4 text-[#797D83]">{Icon.refresh}</span>
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
      <div className="bg-[#111111] rounded-2xl border border-white/[0.06] mb-4 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-white/[0.04]">
          <span className="w-4 h-4 text-[#797D83]">{Icon.trend}</span>
          <p className="text-[11px] text-[#797D83] font-medium uppercase tracking-[0.12em]">Fortschritt</p>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2.5">
          <AnalyseTile label="Diese Woche" sub="Trainings" icon={Icon.dumbbell} value={<AnimatedNumber value={weeklyStats.workouts} />} />
          <AnalyseTile label="Diese Woche" sub="Trainingszeit" icon={Icon.clock} value={formatDuration(weeklyStats.seconds)} />
          <AnalyseTile label="Dieser Monat" sub="Trainings" icon={Icon.dumbbell} value={<AnimatedNumber value={monthlyStats.workouts} />} />
          <AnalyseTile label="Dieser Monat" sub="Trainingszeit" icon={Icon.clock} value={formatDuration(monthlyStats.seconds)} />
        </div>
      </div>

      {/* Diese Woche */}
      <div className="bg-[#111111] rounded-2xl border border-white/[0.06] mb-4 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-white/[0.04]">
          <p className="text-[11px] text-[#797D83] font-medium uppercase tracking-[0.12em]">Diese Woche</p>
        </div>
        <div className="px-5 py-3 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#797D83]">Training</span>
            <span className="font-medium text-[#EDECEA]">{trainingStatusText}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[#797D83]">Check-in</span>
            <span className={`font-medium ${hasWeeklyCheckin ? 'text-[#A78BFA]' : 'text-amber-400'}`}>
              {hasWeeklyCheckin ? 'Erledigt' : 'Offen'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setWeightInput(''); setWeightOpen(true) }}
          className="lift press group relative overflow-hidden rounded-2xl p-4 text-left bg-[#A78BFA] shadow-[0_8px_32px_-12px_rgba(167,139,250,0.5)]"
        >
          <span className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative w-9 h-9 rounded-xl bg-black/15 flex items-center justify-center mb-3">
            <span className="w-4 h-4 block text-[#050504]">{Icon.plus}</span>
          </div>
          <div className="relative font-bold text-[14px] tracking-tight text-[#050504]">Gewicht eintragen</div>
          <div className="relative text-[#050504]/60 text-[12px] mt-0.5">Heute, {new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</div>
        </button>
        <Link
          href="/client/messages"
          className="lift press group rounded-2xl p-4 bg-[#111111] border border-white/[0.06] hover:border-white/[0.1] hover:bg-[#181818] transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#797D83] mb-3">
            <span className="w-5 h-5 block">{Icon.chat}</span>
          </div>
          <div className="font-bold text-[14px] text-[#EDECEA] tracking-tight">Trainer schreiben</div>
          <div className="text-[#797D83] text-[12px] mt-0.5">Frage stellen oder Update</div>
          {unreadMessageCount > 0 && (
            <div className="mt-2 inline-flex min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold items-center justify-center">
              {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
            </div>
          )}
        </Link>
      </div>

      {/* Gewicht-Modal */}
      {weightOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm motion-page-fade">
          <div className="w-full max-w-sm bg-[#111111] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="font-bold text-[#EDECEA] tracking-tight">Gewicht eintragen</h2>
              {lastWeight?.body_weight && (
                <p className="text-[12px] text-[#797D83] mt-0.5">Letzter Eintrag: {lastWeight.body_weight} kg</p>
              )}
            </div>
            <div className="px-5 py-4">
              <label className="block text-[12px] font-medium text-[#797D83] mb-2 uppercase tracking-[0.1em]">
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
                className="w-full px-4 py-3 border border-white/[0.1] bg-white/[0.05] rounded-xl text-lg font-bold text-center tabular-nums text-[#EDECEA] placeholder-[#797D83] focus:border-[#A78BFA]/40 focus:outline-none transition"
              />
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setWeightOpen(false)}
                className="press flex-1 py-3 border border-white/[0.08] text-[#797D83] font-medium rounded-xl hover:bg-white/[0.04] text-[13px]"
              >
                Abbrechen
              </button>
              <SuccessButton
                onClick={handleSaveWeight}
                disabled={!weightInput || weightSaving}
                success={weightSaved}
                className="press flex-1 py-3 bg-[#A78BFA] hover:bg-[#B79FFB] disabled:opacity-40 text-[#050504] font-bold rounded-xl text-[13px] shadow-[0_4px_12px_-4px_rgba(167,139,250,0.4)]"
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
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(167,139,250,0.12)" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={r} fill="none"
          stroke="#A78BFA" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.23, 1, 0.32, 1)', filter: 'drop-shadow(0 0 4px rgba(167,139,250,0.5))' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] font-bold tabular-nums text-[#A78BFA]">{pct}%</span>
      </div>
    </div>
  )
}

function DarkStatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="lift relative overflow-hidden bg-[#111111] rounded-2xl border border-white/[0.06] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[24px] font-bold text-[#EDECEA] tracking-tight tabular-nums leading-none">{value}</div>
          <div className="text-[11.5px] text-[#797D83] mt-2">{label}</div>
        </div>
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-[#A78BFA]/10 text-[#A78BFA]">
          <span className="w-4 h-4 block">{icon}</span>
        </div>
      </div>
    </div>
  )
}

function AnalyseTile({ label, sub, icon, value }: { label: string; sub: string; icon: ReactNode; value: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.04] p-3">
      <div className="flex items-center gap-1.5 text-[#797D83]">
        <span className="w-3.5 h-3.5">{icon}</span>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.1em]">{label}</span>
      </div>
      <div className="text-[20px] font-bold text-[#EDECEA] tracking-tight tabular-nums mt-1.5 leading-none">{value}</div>
      <div className="text-[11.5px] text-[#797D83] mt-1">{sub}</div>
    </div>
  )
}

function DarkEmptyCard({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-6 text-center mb-4">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#797D83] mb-3">
        <span className="w-6 h-6 block">{icon}</span>
      </div>
      <p className="text-[#797D83] text-[13px]">{text}</p>
    </div>
  )
}
