'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewClientPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) {
      setError('Name ist erforderlich.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/backend/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
        }),
      })

      const payload = await response.json().catch(() => null) as {
        message?: string
        error?: string
      } | null

      if (!response.ok) {
        if (response.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError(payload?.message ?? payload?.error ?? 'Unbekannter Fehler.')
        }
        setSaving(false)
        return
      }

      router.push('/admin/clients')
    } catch {
      setError('Netzwerkfehler beim Erstellen des Kunden.')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/clients" className="text-sm text-gray-500 hover:text-gray-700">
          ← Zurück zu Kunden
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Neuer Kunde</h1>
        <p className="text-gray-500 text-sm mt-1">
          Erstellt ein Kundenprofil im neuen Backend.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

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

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            E-Mail <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="max@example.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

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

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1.5">
            Notiz <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Interne Notiz"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/clients"
            className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 text-center"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Wird erstellt…' : 'Kunde erstellen'}
          </button>
        </div>
      </form>
    </div>
  )
}

