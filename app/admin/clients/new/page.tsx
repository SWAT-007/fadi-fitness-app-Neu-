'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface CreatedCredentials {
  email: string
  password: string
  clientId: string
}

export default function NewClientPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<CreatedCredentials | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein.')
      return
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein.')
      return
    }

    setSaving(true)

    const response = await fetch('/api/admin/create-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      }),
    })

    const payload = await response.json().catch(() => null) as {
      ok?: boolean
      clientId?: string
      error?: string
    } | null

    if (!response.ok || !payload?.ok) {
      setError(payload?.error ?? 'Unbekannter Fehler.')
      setSaving(false)
      return
    }

    setDone({ email: email.trim(), password, clientId: payload.clientId! })
    setSaving(false)
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg">
              ✓
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Kunde wurde erstellt</h2>
              <p className="text-sm text-gray-500">{fullName} kann sich jetzt anmelden.</p>
            </div>
          </div>

          {/* Credentials box */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Zugangsdaten zum Weiterschicken
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 w-24">E-Mail</span>
              <span className="text-sm font-medium text-gray-900 select-all">{done.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 w-24">Passwort</span>
              <span className="text-sm font-medium text-gray-900 select-all font-mono">{done.password}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setFullName(''); setEmail(''); setPhone('')
                setPassword(''); setConfirmPassword(''); setDone(null)
              }}
              className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Weiteren Kunden erstellen
            </button>
            <button
              onClick={() => router.push(`/admin/clients/${done.clientId}`)}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Zum Kundenprofil →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/clients" className="text-sm text-gray-500 hover:text-gray-700">
          ← Zurück zu Kunden
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Neuer Kunde</h1>
        <p className="text-gray-500 text-sm mt-1">
          Erstellt einen App-Zugang — Zugangsdaten kannst du danach direkt weiterschicken.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1.5">
            Name
          </label>
          <input
            id="full_name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            autoFocus
            placeholder="Max Mustermann"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {/* E-Mail */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="max@example.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
            Telefon <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+49 123 456789"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        <hr className="border-gray-100" />

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Mindestens 6 Zeichen"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Passwort bestätigen
          </label>
          <input
            id="confirm_password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            placeholder="••••••••"
            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition ${
              confirmPassword && confirmPassword !== password
                ? 'border-red-300 bg-red-50'
                : 'border-gray-200'
            }`}
          />
          {confirmPassword && confirmPassword !== password && (
            <p className="text-xs text-red-500 mt-1">Passwörter stimmen nicht überein.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/clients"
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 text-center"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            disabled={saving || (!!confirmPassword && confirmPassword !== password)}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Wird erstellt…' : 'Kunde erstellen'}
          </button>
        </div>
      </form>
    </div>
  )
}
