'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { StaggerItem } from '@/components/Motion'

type PlanDay = {
  id: string
  name: string
  description: string | null
  sortOrder: number
}

type PlanEntry = {
  id: string
  planId: string
  assignedAt: string
  plan: {
    id: string
    name: string
    description: string | null
    days: PlanDay[]
  }
}

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  dumbbell: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" /></svg>,
  check: <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>,
  repeat: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 12a8 8 0 0114-5.3L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 01-14 5.3L4 16" /><path d="M4 20v-4h4" /></svg>,
  calendar: <svg viewBox="0 0 24 24" {...stroke}><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 3v3M16 3v3" /><path d="M4 9h16" /></svg>,
}

export default function ClientPlanPage() {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)

  const [plans, setPlans] = useState<PlanEntry[]>([])
  const [completedDayIds, setCompletedDayIds] = useState<Set<string>>(new Set())
  const [activeDayIds, setActiveDayIds] = useState<Set<string>>(new Set())
  const [menuOpenDayId, setMenuOpenDayId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setErrorMessage(null)

        const [planRes, logsRes] = await Promise.all([
          fetch('/api/backend/me/active-plan', { cache: 'no-store' }),
          fetch('/api/backend/me/workout-logs/week', { cache: 'no-store' }),
        ])

        if (planRes.status === 401 || logsRes.status === 401) {
          setErrorMessage('Bitte melde dich an, um deinen Trainingsplan zu sehen.')
          setLoading(false)
          return
        }

        if (!planRes.ok) throw new Error(`active-plan: ${planRes.status}`)
        if (!logsRes.ok) throw new Error(`workout-logs: ${logsRes.status}`)

        const planData = await planRes.json() as {
          assignment: { id: string; planId: string; assignedAt: string } | null
          plan: { id: string; name: string; description: string | null; days: PlanDay[] } | null
        }
        const logsData = await logsRes.json() as {
          completedDayIds: string[]
          activeDayIds: string[]
        }

        if (planData.assignment && planData.plan) {
          setPlans([{
            id: planData.assignment.id,
            planId: planData.assignment.planId,
            assignedAt: planData.assignment.assignedAt,
            plan: planData.plan,
          }])
        } else {
          setPlans([])
        }

        setCompletedDayIds(new Set(logsData.completedDayIds ?? []))
        setActiveDayIds(new Set(logsData.activeDayIds ?? []))
        setLoading(false)
      } catch (error) {
        console.error('Failed to load client plans', error)
        setErrorMessage('Dein Trainingsplan konnte gerade nicht geladen werden.')
        setPlans([])
        setCompletedDayIds(new Set())
        setActiveDayIds(new Set())
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Hero — trainer image 3 */}
      <div className="relative overflow-hidden h-[200px] mx-4 mt-4 mb-4 rounded-2xl">
        <Image
          src="/images/app-style/3.jpeg"
          alt="Training"
          fill
          className="object-cover object-top"
          style={{ filter: 'brightness(0.65) contrast(1.08)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050504]/80 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050504]/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-[#A78BFA]/0 via-[#A78BFA]/30 to-[#A78BFA]/0" />
        <div className="absolute inset-0 flex flex-col justify-end p-5">
          <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[#A78BFA] mb-1">Aktives Programm</p>
          <h1 className="text-[22px] font-bold text-white tracking-tight leading-tight">Mein Training</h1>
        </div>
      </div>

      <div className="px-4 pb-8">
        {errorMessage && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            {errorMessage}
          </div>
        )}

        {menuOpenDayId && <div className="fixed inset-0 z-10" onClick={() => setMenuOpenDayId(null)} />}

        {plans.length === 0 ? (
          <div className="bg-[#111111] rounded-2xl border border-white/[0.06] p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#797D83] mx-auto mb-3">
              <span className="w-6 h-6">{Icon.dumbbell}</span>
            </div>
            <p className="text-[#797D83] text-sm">Kein aktiver Trainingsplan vorhanden.</p>
            <p className="text-[#797D83]/60 text-xs mt-1">Dein Trainer wird dir bald einen Plan zuweisen.</p>
          </div>
        ) : (
          plans.map((ap, planIndex) => {
            const sortedDays = [...(ap.plan.days ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
            const completedCount = sortedDays.filter(d => completedDayIds.has(d.id)).length
            const progressPct = sortedDays.length > 0 ? Math.round((completedCount / sortedDays.length) * 100) : 0

            return (
              <StaggerItem key={ap.id} index={planIndex} className="mb-6">
                <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-visible">
                  {/* Plan header */}
                  <div className="px-5 pt-5 pb-4 border-b border-white/[0.04]">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-[11px] text-[#797D83] font-medium uppercase tracking-[0.12em]">Aktueller Plan</p>
                        <h2 className="font-bold text-[#EDECEA] mt-0.5 text-[17px] tracking-tight">{ap.plan.name}</h2>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#797D83] text-[11px] shrink-0 mt-0.5">
                        <span className="w-3.5 h-3.5">{Icon.calendar}</span>
                        <span>{new Date(ap.assignedAt).toLocaleDateString('de-DE')}</span>
                      </div>
                    </div>
                    {/* Week progress bar */}
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#A78BFA] rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-[#797D83] tabular-nums shrink-0">
                        {completedCount}/{sortedDays.length} Tage
                      </span>
                    </div>
                  </div>

                  {/* Days */}
                  <div className="p-3 space-y-1">
                    {sortedDays.map((day, index) => {
                      const isActive = activeDayIds.has(day.id) && !completedDayIds.has(day.id)
                      const isDone = completedDayIds.has(day.id)
                      const rowBg = isActive ? 'bg-[#A78BFA]/[0.07]' : isDone ? 'bg-white/[0.02]' : 'hover:bg-white/[0.03]'

                      return (
                        <StaggerItem key={day.id} index={index} className={`relative ${menuOpenDayId === day.id ? 'z-40' : 'z-0'}`}>
                          <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${rowBg}`}>
                            <button
                              onClick={() => router.push(`/client/plan/${day.id}`)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                isActive ? 'bg-[#A78BFA] text-[#050504]'
                                : isDone ? 'bg-white/[0.08] text-[#A78BFA]'
                                : 'bg-white/[0.05] text-[#797D83]'
                              }`}>
                                {isActive
                                  ? <span className="relative flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#050504] opacity-75" />
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#050504]" />
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
                                    : day.description
                                      ? <div className="text-[11.5px] text-[#797D83] truncate mt-0.5">{day.description}</div>
                                      : null}
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
                                className="press flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[12px] font-bold flex-shrink-0 shadow-[0_4px_12px_-4px_rgba(167,139,250,0.35)]"
                              >
                                <span className="w-3 h-3">{Icon.play}</span>
                                Starten
                              </button>
                            )}
                          </div>

                          {isDone && menuOpenDayId === day.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-2 top-12 z-30 bg-[#181818] rounded-xl shadow-2xl border border-white/[0.08] py-1 min-w-[170px]"
                            >
                              <button
                                onClick={() => { router.push(`/client/workout/${day.id}/play?fresh=1`); setMenuOpenDayId(null) }}
                                className="press w-full text-left px-4 py-2.5 text-[13px] text-[#EDECEA] hover:bg-white/[0.04] flex items-center gap-2"
                              >
                                <span className="w-4 h-4 text-[#797D83]">{Icon.repeat}</span>
                                Nochmal starten
                              </button>
                            </div>
                          )}
                        </StaggerItem>
                      )
                    })}
                  </div>
                </div>
              </StaggerItem>
            )
          })
        )}
      </div>
    </div>
  )
}
