'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/lib/types'
import { AnimatedNumber, StaggerItem } from '@/components/Motion'

type InviteResult = {
  token: string
  expiresAt: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('trainer_id', user.id)
        .order('full_name')

      setClients(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const inviteLink = useMemo(() => {
    if (!inviteResult?.token || typeof window === 'undefined') return ''
    const url = new URL('/login', window.location.origin)
    url.searchParams.set('inviteToken', inviteResult.token)
    return url.toString()
  }, [inviteResult])

  const copyToClipboard = async (value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // ignore
    }
  }

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInviteLoading(true)
    setInviteError('')
    setInviteResult(null)

    try {
      const response = await fetch('/api/admin/client-link-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail }),
      })

      const payload = await response.json().catch(() => null) as
        | { token?: string; expiresAt?: string; error?: string }
        | null

      if (!response.ok || !payload?.token || !payload?.expiresAt) {
        setInviteError(payload?.error ?? 'Einladungslink konnte nicht erstellt werden.')
        return
      }

      setInviteResult({
        token: payload.token,
        expiresAt: payload.expiresAt,
      })
    } catch {
      setInviteError('Netzwerkfehler beim Erstellen des Einladungslinks.')
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="text-gray-500 text-sm mt-1"><AnimatedNumber value={clients.length} /> Kunden gesamt</p>
        </div>
        <Link
          href="/admin/clients/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Neuer Kunde
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex flex-col gap-1 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Einladungslink erstellen</h2>
          <p className="text-sm text-gray-500">
            Erstelle einen Link für die spätere Verknüpfung eines neuen Clients.
          </p>
        </div>

        <form onSubmit={handleInviteSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Client-E-Mail
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
              placeholder="kunde@example.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={inviteLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors"
          >
            {inviteLoading ? 'Erstelle…' : 'Einladung erstellen'}
          </button>
        </form>

        {inviteError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {inviteError}
          </div>
        ) : null}

        {inviteResult ? (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4 space-y-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">Token</div>
              <div className="mt-1 break-all text-sm text-gray-800">{inviteResult.token}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">Einladungslink</div>
              <div className="mt-1 break-all text-sm text-gray-800">{inviteLink}</div>
            </div>
            <div className="text-sm text-gray-600">
              Gültig bis: {new Date(inviteResult.expiresAt).toLocaleString('de-DE')}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(inviteResult.token)}
                className="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 text-sm font-medium hover:bg-white transition-colors"
              >
                Token kopieren
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(inviteLink)}
                className="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 text-sm font-medium hover:bg-white transition-colors"
              >
                Link kopieren
              </button>
            </div>
          </div>
        ) : null}
      </div>

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
                      {client.email}{client.phone ? ` · ${client.phone}` : ''}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                </StaggerItem>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
