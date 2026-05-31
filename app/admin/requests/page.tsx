'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StaggerItem, useToast } from '@/components/Motion'

type ChangeRequest = {
  id: string
  client_id?: string | null
  day_id?: string | null
  exercise_id?: string | null
  plan_id?: string | null
  clientId?: string | null
  dayId?: string | null
  exerciseId?: string | null
  planId?: string | null
  reason: string
  status: string
  created_at: string
  clients: { full_name: string; user_id: string | null } | null
  exercises: { id: string; name: string } | null
}

const normalizeStatus = (status: string | null | undefined) =>
  (status ?? '').trim().toLowerCase()

const isOpenStatus = (status: string | null | undefined) => {
  const value = normalizeStatus(status)
  return value === 'pending' || value === 'open'
}

const isResolvedStatus = (status: string | null | undefined) => {
  const value = normalizeStatus(status)
  return value === 'resolved' || value === 'done' || value === 'completed'
}

const statusLabel = (status: string | null | undefined) => {
  if (isOpenStatus(status)) return 'Offen'
  if (isResolvedStatus(status)) return 'Erledigt'
  if (normalizeStatus(status) === 'rejected') return 'Abgelehnt'
  return 'Verlauf'
}

const statusPillClass = (status: string | null | undefined) => {
  if (isOpenStatus(status)) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  if (isResolvedStatus(status)) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (normalizeStatus(status) === 'rejected') return 'bg-red-500/10 text-red-400 border-red-500/20'
  return 'bg-white/[0.05] text-[#797D83] border-white/[0.08]'
}

const buildPlanHref = (request: ChangeRequest) => {
  const planId = request.plan_id ?? request.planId ?? null
  const dayId = request.day_id ?? request.dayId ?? null
  const exerciseId = request.exercise_id ?? request.exerciseId ?? null

  if (!planId || !dayId || !exerciseId || !request.id) return null
  const params = new URLSearchParams({
    dayId,
    exerciseId,
    requestId: request.id,
  })
  return `/admin/plans/${encodeURIComponent(planId)}?${params.toString()}`
}

export default function RequestsPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState('')
  const loggedMissingTargetIdsRef = useRef<Set<string>>(new Set())

  const openRequests = useMemo(
    () => requests.filter(item => isOpenStatus(item.status)),
    [requests],
  )
  const historyRequests = useMemo(
    () => requests.filter(item => !isOpenStatus(item.status)),
    [requests],
  )

  const load = useCallback(async () => {
    try {
      setError('')
      const response = await fetch('/api/backend/clients/exercise-change-requests?status=all', {
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null) as
        | { requests?: ChangeRequest[]; message?: string }
        | null

      if (!response.ok) {
        if (response.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError(payload?.message ?? 'Anfragen konnten nicht geladen werden.')
        }
        return
      }

      setRequests(payload?.requests ?? [])
    } catch {
      setError('Anfragen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()

    const interval = setInterval(() => void load(), 30_000)
    const onFocus = () => void load()
    const onVisibility = () => { if (document.visibilityState === 'visible') void load() }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  useEffect(() => {
    for (const request of requests) {
      if (buildPlanHref(request) || loggedMissingTargetIdsRef.current.has(request.id)) continue
      loggedMissingTargetIdsRef.current.add(request.id)
      console.warn('[admin/requests] request target missing', request)
    }
  }, [requests])

  const updateStatus = async (id: string, status: 'resolved' | 'rejected') => {
    setUpdating(id)
    setError('')

    try {
      const response = await fetch(`/api/backend/clients/exercise-change-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      })
      const payload = await response.json().catch(() => null) as { message?: string } | null

      if (!response.ok) {
        if (response.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError(payload?.message ?? 'Anfrage konnte nicht aktualisiert werden.')
        }
        return
      }

      setRequests(prev => prev.map(item => (
        item.id === id ? { ...item, status } : item
      )))
      showToast(
        status === 'resolved' ? 'Anfrage erledigt' : 'Anfrage abgelehnt',
        status === 'resolved' ? 'success' : 'danger',
      )
    } catch {
      setError('Anfrage konnte nicht aktualisiert werden.')
    } finally {
      setUpdating(null)
    }
  }

  const handleExerciseTargetClick = (request: ChangeRequest) => {
    const planId = request.plan_id ?? request.planId ?? null
    const dayId = request.day_id ?? request.dayId ?? null
    const exerciseId = request.exercise_id ?? request.exerciseId ?? null
    const href = buildPlanHref(request)

    console.log('[admin/requests] exercise target click', {
      requestId: request.id,
      planId,
      dayId,
      exerciseId,
      href,
    })

    if (!href) {
      console.warn('[admin/requests] request target missing on click', request)
      showToast('Ziel fehlt. Bitte Anfrage prüfen.', 'info')
      return
    }

    startTransition(() => {
      router.push(href)
    })
  }

  const renderRequestCard = (req: ChangeRequest, index: number, isHistory: boolean) => {
    const planHref = buildPlanHref(req)
    const missingTargetData = !planHref

    return (
      <StaggerItem key={req.id} index={index} className="bg-[#111111] rounded-2xl border border-white/[0.06] shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-[#EDECEA]">
                {req.clients?.full_name ?? '-'}
              </span>
              <span className="text-[#797D83] text-sm">möchte tauschen:</span>
              {planHref ? (
                <button
                  type="button"
                  className="inline-flex min-h-[24px] items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/20 hover:bg-[#A78BFA]/20 transition-colors cursor-pointer"
                  title="Zur Übung im Plan springen"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleExerciseTargetClick(req)
                  }}
                >
                  <span>{req.exercises?.name ?? '-'}</span>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h10v10M19 5L5 19" />
                  </svg>
                </button>
              ) : (
                <div className="inline-flex items-center gap-2">
                  <span
                    className="inline-flex min-h-[24px] items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/[0.06] text-[#797D83] border border-white/[0.08] cursor-not-allowed"
                    title={missingTargetData ? 'Kein Deep-Link verfügbar (planId/dayId/exerciseId fehlt).' : undefined}
                  >
                    {req.exercises?.name ?? '-'}
                  </span>
                  <span className="text-[11px] font-medium text-amber-300/90">
                    Ziel fehlt
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-[#797D83]">
              {new Date(req.created_at).toLocaleDateString('de-DE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>

          <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusPillClass(req.status)}`}>
            {statusLabel(req.status)}
          </span>
        </div>

        <div className="bg-[#050504] rounded-xl px-4 py-3 mb-4">
          <p className="text-xs font-medium text-[#797D83] mb-1">Begründung</p>
          <p className="text-sm text-[#EDECEA]">{req.reason}</p>
        </div>

        {!isHistory && (
          <div className="flex gap-2">
            <button
              onClick={() => updateStatus(req.id, 'rejected')}
              disabled={updating === req.id}
              className="flex-1 py-2 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-[#050504] disabled:opacity-50 transition-colors"
            >
              Ablehnen
            </button>
            <button
              onClick={() => updateStatus(req.id, 'resolved')}
              disabled={updating === req.id}
              className="flex-1 py-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
            >
              {updating === req.id ? 'Wird gespeichert...' : 'Als erledigt markieren'}
            </button>
          </div>
        )}
      </StaggerItem>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#EDECEA]">Übungswechsel-Anfragen</h1>
        <p className="text-[#797D83] text-sm mt-1">
          {loading ? '...' : `${openRequests.length} offene Anfrage${openRequests.length !== 1 ? 'n' : ''}`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm uppercase tracking-[0.12em] text-[#797D83] mb-3">Offen</h2>
            {openRequests.length === 0 ? (
              <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-10 text-center shadow-sm">
                <p className="text-[#797D83]">Keine offenen Anfragen.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openRequests.map((req, index) => renderRequestCard(req, index, false))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-[0.12em] text-[#797D83] mb-3">Verlauf</h2>
            {historyRequests.length === 0 ? (
              <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-10 text-center shadow-sm">
                <p className="text-[#797D83]">Noch kein Verlauf vorhanden.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyRequests.map((req, index) => renderRequestCard(req, index, true))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
