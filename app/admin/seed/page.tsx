'use client'

import { useState } from 'react'
import Link from 'next/link'

type ClientResult =
  | { client_id: string; workouts: number; exerciseLogs: number; progressLogs: number }
  | { client_id: string; skipped: true; reason: string }
  | { client_id: string; error: string }

export default function SeedPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<ClientResult[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const handleSeed = async () => {
    setStatus('loading')
    setResults([])
    setErrorMsg('')
    try {
      const res = await fetch('/api/admin/seed', {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => null) as {
        ok?: boolean
        message?: string
        error?: string
        results?: ClientResult[]
      } | null

      if (!res.ok) {
        setErrorMsg(json?.message ?? json?.error ?? `Seed-API fehlgeschlagen. Status: ${res.status}`)
        setStatus('error')
        return
      }

      if (json?.ok !== true) {
        setErrorMsg(json?.message ?? 'Seed-API hat keine erfolgreiche Antwort zurückgegeben.')
        setStatus('error')
        return
      }

      setResults(json.results ?? [])
      setStatus('done')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Netzwerkfehler'
      setErrorMsg(`Seed-API konnte nicht erreicht werden: ${message}`)
      setStatus('error')
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-6">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurück
      </Link>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-800">
        <strong>Nur für Entwicklung.</strong> Generiert ~3 Monate realistische Trainingsdaten für alle Kunden mit aktivem Plan. Vorhandene Daten im Zeitraum werden ersetzt.
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Testdaten generieren</h1>
        <p className="text-sm text-gray-500 mb-6">
          Workout-Logs, Satz-Details und Gewichtsverläufe für die letzten 3 Monate.
        </p>

        <button
          onClick={handleSeed}
          disabled={status === 'loading'}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Wird generiert…
            </>
          ) : '🗂 Testdaten generieren'}
        </button>
      </div>

      {status === 'error' && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          <strong>Fehler:</strong> {errorMsg}
          {errorMsg.includes('RLS') || errorMsg.includes('policy') ? (
            <p className="mt-2">Füge <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY=...</code> in <code className="bg-red-100 px-1 rounded">.env.local</code> ein (Supabase → Project Settings → API).</p>
          ) : null}
        </div>
      )}

      {status === 'done' && results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((r, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 font-mono mb-2 truncate">{r.client_id}</div>
              {'error' in r ? (
                <p className="text-sm text-red-600">Fehler: {r.error}</p>
              ) : 'skipped' in r ? (
                <p className="text-sm text-amber-600">Übersprungen: {r.reason}</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center bg-emerald-50 rounded-xl py-2">
                    <div className="text-xl font-bold text-emerald-700">{r.workouts}</div>
                    <div className="text-xs text-emerald-600">Trainings</div>
                  </div>
                  <div className="text-center bg-blue-50 rounded-xl py-2">
                    <div className="text-xl font-bold text-blue-700">{r.exerciseLogs}</div>
                    <div className="text-xs text-blue-600">Sätze</div>
                  </div>
                  <div className="text-center bg-purple-50 rounded-xl py-2">
                    <div className="text-xl font-bold text-purple-700">{r.progressLogs}</div>
                    <div className="text-xs text-purple-600">Gewichts­logs</div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <Link
            href="/admin/clients"
            className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors mt-2"
          >
            Kunden ansehen →
          </Link>
        </div>
      )}
    </div>
  )
}
