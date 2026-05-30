'use client'

import { useCallback, useEffect, useState } from 'react'
import { StaggerItem, useToast } from '@/components/Motion'

type ChangeRequest = {
  id: string
  reason: string
  status: string
  created_at: string
  clients: { full_name: string; user_id: string | null } | null
  exercises: { name: string } | null
}

export default function RequestsPage() {
  const { showToast } = useToast()
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const response = await fetch('/api/backend/clients/exercise-change-requests', {
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

      setRequests(prev => prev.filter(r => r.id !== id))
      showToast(
        status === 'resolved' ? 'Anfrage erledigt ✓' : 'Anfrage abgelehnt',
        status === 'resolved' ? 'success' : 'danger',
      )
    } catch {
      setError('Anfrage konnte nicht aktualisiert werden.')
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#EDECEA]">Übungswechsel-Anfragen</h1>
        <p className="text-[#797D83] text-sm mt-1">
          {loading ? '…' : `${requests.length} offene Anfrage${requests.length !== 1 ? 'n' : ''}`}
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
      ) : requests.length === 0 ? (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-16 text-center shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#A78BFA]/10 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-[#A78BFA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[#797D83]">Keine offenen Anfragen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req, index) => (
            <StaggerItem key={req.id} index={index} className="bg-[#111111] rounded-2xl border border-white/[0.06] shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-[#EDECEA]">
                      {req.clients?.full_name ?? '—'}
                    </span>
                    <span className="text-[#797D83] text-sm">möchte tauschen:</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#A78BFA]/10 text-[#A78BFA]">
                      {req.exercises?.name ?? '—'}
                    </span>
                  </div>

                  <p className="text-xs text-[#797D83]">
                    {new Date(req.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>

                <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Offen
                </span>
              </div>

              <div className="bg-[#050504] rounded-xl px-4 py-3 mb-4">
                <p className="text-xs font-medium text-[#797D83] mb-1">Begründung</p>
                <p className="text-sm text-[#EDECEA]">{req.reason}</p>
              </div>

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
                  {updating === req.id ? 'Wird gespeichert…' : 'Als erledigt markieren'}
                </button>
              </div>
            </StaggerItem>
          ))}
        </div>
      )}
    </div>
  )
}
