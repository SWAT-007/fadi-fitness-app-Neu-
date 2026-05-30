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

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  users: <svg viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3.25" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3 3 0 010 6" /><path d="M21 20c0-2.5-1.7-4.7-4-5.6" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 5v14M5 12h14" /></svg>,
  arrow: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 5l7 7-7 7" /></svg>,
  search: <svg viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5l4 4" /></svg>,
  trash: <svg viewBox="0 0 24 24" {...stroke}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>,
}

export default function ClientsPage() {
  const [clients, setClients] = useState<AdminClientListItem[]>([])
  const [search, setSearch] = useState('')
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
        setLoadError(response.status === 401 ? 'Backend-Login erforderlich.' : 'Kunden konnten nicht geladen werden.')
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
    const onFocus = () => { void loadClients() }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void loadClients() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
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
        setDeleteError(response.status === 401 ? 'Backend-Login erforderlich.' : payload?.error ?? 'Kunde konnte nicht gelöscht werden.')
        setDeleting(false)
        return
      }
      setClients((prev) => prev.filter((c) => c.id !== deleteId))
      setDeleteId(null)
    } catch {
      setDeleteError('Netzwerkfehler beim Löschen des Kunden.')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = clients.filter(c =>
    search.trim() === '' ||
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-5 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[26px] font-bold text-[#EDECEA] tracking-tight">Kunden</h1>
          <p className="text-[#797D83] text-[13px] mt-0.5">
            <AnimatedNumber value={clients.length} /> Kunden gesamt
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="press flex items-center gap-2 bg-[#A78BFA] hover:bg-[#B79FFB] text-[#050504] text-[13px] font-bold px-4 py-2.5 rounded-xl transition-colors"
        >
          <span className="w-4 h-4">{Icon.plus}</span> Neuer Kunde
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#797D83]">{Icon.search}</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Kunden suchen…"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#111111] border border-white/[0.08] text-[#EDECEA] placeholder-[#797D83] focus:border-[#A78BFA]/40 focus:outline-none text-[14px] transition-colors"
        />
      </div>

      {deleteError && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {deleteError}
        </div>
      )}
      {loadError && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#797D83] mx-auto mb-3">
            <span className="w-6 h-6">{Icon.users}</span>
          </div>
          <p className="text-[#797D83] mb-3">{search ? 'Keine Treffer.' : 'Noch keine Kunden.'}</p>
          {!search && (
            <Link href="/admin/clients/new" className="press text-[#A78BFA] text-sm hover:text-[#B79FFB] font-medium">
              Ersten Kunden hinzufügen
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((client, index) => (
              <li key={client.id}>
                <StaggerItem index={index}>
                  <div className="flex items-center group hover:bg-white/[0.03] transition-colors">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#A78BFA]/15 border border-[#A78BFA]/20 flex items-center justify-center text-[#A78BFA] font-bold text-sm flex-shrink-0">
                        {client.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#EDECEA] text-[14px] truncate">{client.full_name}</div>
                        <div className="text-[#797D83] text-[12px] truncate">
                          {client.email}
                          {client.phone ? ` · ${client.phone}` : ''}
                        </div>
                      </div>
                      <span className="w-4 h-4 text-[#797D83]/30 group-hover:text-[#797D83] flex-shrink-0 mr-2 transition-transform group-hover:translate-x-0.5">
                        {Icon.arrow}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => { setDeleteError(''); setDeleteId(client.id) }}
                      className="press p-2 mr-3 rounded-lg text-[#797D83]/40 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                      aria-label="Löschen"
                    >
                      <span className="w-4 h-4 block">{Icon.trash}</span>
                    </button>
                  </div>
                </StaggerItem>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111111] border border-white/[0.08] rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center motion-page-fade">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
              <span className="w-6 h-6">{Icon.trash}</span>
            </div>
            <h3 className="font-bold text-[#EDECEA] mb-2 text-[17px]">Kunden löschen?</h3>
            <p className="text-[#797D83] text-sm mb-6">
              Der Kunde und seine zugehörigen Daten werden entfernt. Trainer/Admin-Konten bleiben unberührt.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="press flex-1 py-3 border border-white/[0.08] text-[#797D83] text-sm font-medium rounded-xl hover:bg-white/[0.04] disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="press flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? 'Lösche…' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
