'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminBackendLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/backend/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const payload = await response.json().catch(() => null) as { message?: string } | null
      if (!response.ok) {
        setError(payload?.message ?? 'Backend-Login fehlgeschlagen.')
        setLoading(false)
        return
      }

      router.push('/admin/clients')
    } catch {
      setError('Netzwerkfehler beim Backend-Login.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
          ← Zurück zum Adminbereich
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Backend-Login</h1>
        <p className="text-gray-500 text-sm mt-1">
          Temporärer Backend-Login für die Supabase-Ablösung.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4">
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="trainer.crud@example.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Passwort"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
        >
          {loading ? 'Melde an…' : 'Backend-Login'}
        </button>
      </form>
    </div>
  )
}
