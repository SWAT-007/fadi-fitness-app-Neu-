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
        status === 'resolved' ? 'Anfrage erledigt âœ“' : 'Anfrage abgelehnt',
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
        <h1 className="text-2xl font-bold text-gray-900">Ãœbungswechsel-Anfragen</h1>
        <p className="text-gray-500 text-sm mt-1">
          {loading ? 'â€¦' : `${requests.length} offene Anfrage${requests.length !== 1 ? 'n' : ''}`}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
          <div className="text-5xl mb-3">âœ…</div>
          <p className="text-gray-500">Keine offenen Anfragen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req, index) => (
            <StaggerItem key={req.id} index={index} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {req.clients?.full_name ?? 'â€”'}
                    </span>
                    <span className="text-gray-400 text-sm">mÃ¶chte tauschen:</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {req.exercises?.name ?? 'â€”'}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>

                <span className="flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  Offen
                </span>
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs font-medium text-gray-400 mb-1">BegrÃ¼ndung</p>
                <p className="text-sm text-gray-700">{req.reason}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus(req.id, 'rejected')}
                  disabled={updating === req.id}
                  className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Ablehnen
                </button>
                <button
                  onClick={() => updateStatus(req.id, 'resolved')}
                  disabled={updating === req.id}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
                >
                  {updating === req.id ? 'Wird gespeichertâ€¦' : 'Als erledigt markieren'}
                </button>
              </div>
            </StaggerItem>
          ))}
        </div>
      )}
    </div>
  )
}
