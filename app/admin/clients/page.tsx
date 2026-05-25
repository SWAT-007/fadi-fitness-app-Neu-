'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatedNumber, StaggerItem } from '@/components/Motion'

type AdminClientListItem = {
  id: string
  full_name: string
  email: string
  phone: string | null
}

export default function ClientsPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [loadError, setLoadError] = useState('')

  const loadClients = useCallback(async () => {
    try {
      setLoadError('')
      const response = await fetch('/api/backend/clients', { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as
        | { clients?: Array<{ id: string; name?: string; displayName?: string; email?: string; phone?: string | null }> }
        | { message?: string }
        | null

      if (!response.ok) {
        if (response.status === 401) {
          setLoadError('Backend-Login erforderlich.')
        } else {
          setLoadError('Kunden konnten nicht geladen werden.')
        }
        return
      }

      const mappedClients = (payload && 'clients' in payload ? payload.clients : []) ?? []
      setClients(
        mappedClients.map((client) => ({
          id: client.id,
          full_name: client.displayName ?? client.name ?? 'Unbenannt',
          email: client.email ?? '',
          phone: client.phone ?? null,
        })),
      )
    } catch {
      setLoadError('Kunden konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadClients()

    const onFocus = () => {
      void loadClients()
    }
    const onPageShow = () => {
      void loadClients()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadClients()
      }
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadClients])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    setDeleteError('')

    try {
      const response = await fetch(`/api/backend/clients/${deleteId}`, { method: 'DELETE' })

      const payload = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        if (response.status === 401) {
          setDeleteError('Backend-Login erforderlich.')
        } else {
          setDeleteError(payload?.error ?? 'Kunde konnte nicht gelöscht werden.')
        }
        setDeleting(false)
        return
      }

      setClients((prev) => prev.filter((client) => client.id !== deleteId))
      setDeleteId(null)
    } catch {
      setDeleteError('Netzwerkfehler beim Löschen des Kunden.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="text-gray-500 text-sm mt-1">
            <AnimatedNumber value={clients.length} /> Kunden gesamt
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Neuer Kunde
        </Link>
      </div>

      {deleteError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      ) : null}
      {loadError ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <div className="text-5xl mb-3">👥</div>
          <p className="text-gray-500 mb-3">Noch keine Kunden.</p>
          <Link href="/admin/clients/new" className="text-indigo-600 text-sm hover:underline">
            Ersten Kunden hinzufügen
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <ul className="divide-y divide-gray-100">
            {clients.map((client, index) => (
              <li key={client.id}>
                <StaggerItem index={index}>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                      {client.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm">{client.full_name}</div>
                      <div className="text-gray-500 text-xs">
                        {client.email}
                        {client.phone ? ` · ${client.phone}` : ''}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 px-4">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError('')
                        setDeleteId(client.id)
                      }}
                      className="text-xs text-red-500 hover:text-red-600 font-medium py-1.5 rounded-lg hover:bg-red-50 transition-colors px-2"
                    >
                      Löschen
                    </button>
                    <svg
                      className="w-4 h-4 text-gray-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </StaggerItem>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Kunden löschen?</h3>
            <p className="text-gray-500 text-sm mb-6">
              Der Kunde und seine zugehörigen Daten werden entfernt. Trainer/Admin-Konten bleiben unberührt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-60"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
              >
                {deleting ? 'Lösche...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
