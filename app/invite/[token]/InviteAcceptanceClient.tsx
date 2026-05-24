'use client'

import { useEffect, useMemo, useState } from 'react'

type InvitePayload = {
  email: string
  expiresAt: string
  trainerName: string
}

type Props = {
  token: string
}

export function InviteAcceptanceClient({ token }: Props) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [invite, setInvite] = useState<InvitePayload | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const loadInvite = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        })

        const payload = await response.json().catch(() => null) as
          | { ok?: boolean; invite?: InvitePayload; message?: string }
          | null

        if (!response.ok || !payload?.invite) {
          setError(payload?.message ?? 'Einladungslink konnte nicht geladen werden.')
          return
        }

        setInvite(payload.invite)
        setEmail(payload.invite.email)
      } catch {
        setError('Netzwerkfehler beim Laden der Einladung.')
      } finally {
        setLoading(false)
      }
    }

    loadInvite()
  }, [token])

  const expiresAtLabel = useMemo(() => {
    if (!invite?.expiresAt) return ''
    return new Date(invite.expiresAt).toLocaleString('de-DE')
  }, [invite])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      })

      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; message?: string }
        | null

      if (!response.ok || payload?.ok !== true) {
        setError(payload?.message ?? 'Einladung konnte nicht angenommen werden.')
        return
      }

      setSuccess(payload.message ?? 'Einladung erfolgreich angenommen.')
      setPassword('')
    } catch {
      setError('Netzwerkfehler beim Abschließen der Einladung.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Einladung annehmen</h1>
            <p className="mt-2 text-sm text-gray-500">
              Erstelle dein Client-Konto und verknüpfe es mit deinem Trainer.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : error && !invite ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <>
              {invite ? (
                <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-4 text-sm text-gray-700">
                  <div>
                    <span className="font-medium text-gray-900">Trainer:</span> {invite.trainerName}
                  </div>
                  <div className="mt-1">
                    <span className="font-medium text-gray-900">E-Mail:</span> {invite.email}
                  </div>
                  <div className="mt-1">
                    <span className="font-medium text-gray-900">Gültig bis:</span> {expiresAtLabel}
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {success}
                  </div>
                ) : null}

                <div>
                  <label htmlFor="full-name" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    id="full-name"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    placeholder="Max Mustermann"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="invite-email" className="mb-1.5 block text-sm font-medium text-gray-700">
                    E-Mail
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 transition focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="invite-password" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Passwort
                  </label>
                  <input
                    id="invite-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={6}
                    required
                    placeholder="Mindestens 6 Zeichen"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !invite}
                  className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                >
                  {submitting ? 'Wird erstellt…' : 'Einladung annehmen'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
