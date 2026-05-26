'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { NutritionGoal } from '@/lib/types'

const GOALS: { value: NutritionGoal; label: string; desc: string; icon: string }[] = [
  { value: 'cut', label: 'Abnehmen', desc: 'Kaloriendefizit, viel Protein', icon: '📉' },
  { value: 'bulk', label: 'Muskelaufbau', desc: 'Kalorienueberschuss, viel Protein', icon: '💪' },
  { value: 'maintain', label: 'Erhaltung', desc: 'Kalorienbedarf halten', icon: '⚖️' },
]

type BackendCreatedPlan = {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  mealCount: number
  assignmentCount: number
}

export default function NewNutritionPlanPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState<NutritionGoal>('maintain')
  const [calories, setCalories] = useState('2000')
  const [protein, setProtein] = useState('150')
  const [carbs, setCarbs] = useState('200')
  const [fat, setFat] = useState('70')

  const suggestMacros = (kcal: number, g: NutritionGoal) => {
    if (g === 'cut') {
      setProtein(String(Math.round((kcal * 0.35) / 4)))
      setCarbs(String(Math.round((kcal * 0.35) / 4)))
      setFat(String(Math.round((kcal * 0.3) / 9)))
    } else if (g === 'bulk') {
      setProtein(String(Math.round((kcal * 0.3) / 4)))
      setCarbs(String(Math.round((kcal * 0.45) / 4)))
      setFat(String(Math.round((kcal * 0.25) / 9)))
    } else {
      setProtein(String(Math.round((kcal * 0.3) / 4)))
      setCarbs(String(Math.round((kcal * 0.4) / 4)))
      setFat(String(Math.round((kcal * 0.3) / 9)))
    }
  }

  const macroKcal = Number(protein) * 4 + Number(carbs) * 4 + Number(fat) * 9

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Name ist erforderlich.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/backend/nutrition/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.message ?? 'Fehler beim Erstellen.')
        setSaving(false)
        return
      }

      const plan = (payload?.plan ?? null) as BackendCreatedPlan | null
      if (!plan?.id) {
        setError('Ungueltige Backend-Antwort.')
        setSaving(false)
        return
      }

      router.push(`/admin/nutrition/${plan.id}`)
    } catch {
      setError('Backend nicht erreichbar.')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/admin/nutrition" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurueck zu Ernaehrungsplaenen
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Neuer Ernaehrungsplan</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Plan-Informationen</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Masseaufbau Plan, Diaet Phase 1"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Beschreibung (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurze Beschreibung des Plans..."
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Ziel</h2>
          <div className="grid grid-cols-3 gap-3">
            {GOALS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => {
                  setGoal(g.value)
                  if (calories) suggestMacros(Number(calories), g.value)
                }}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all ${
                  goal === g.value ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl">{g.icon}</span>
                <span className={`text-sm font-semibold ${goal === g.value ? 'text-green-700' : 'text-gray-700'}`}>
                  {g.label}
                </span>
                <span className="text-xs text-gray-400 text-center leading-tight">{g.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Tagesziele</h2>
            <button
              type="button"
              onClick={() => calories && suggestMacros(Number(calories), goal)}
              className="text-xs text-green-600 hover:text-green-700 font-medium"
            >
              Makros auto-berechnen
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tageskalorien (kcal)</label>
            <input
              type="number"
              min={500}
              max={8000}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Protein (g)', value: protein, set: setProtein, kcal: Number(protein) * 4 },
              { label: 'Kohlenhydrate (g)', value: carbs, set: setCarbs, kcal: Number(carbs) * 4 },
              { label: 'Fett (g)', value: fat, set: setFat, kcal: Number(fat) * 9 },
            ].map((m) => (
              <div key={m.label}>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">{m.label}</label>
                <input
                  type="number"
                  min={0}
                  value={m.value}
                  onChange={(e) => m.set(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">{m.kcal} kcal</p>
              </div>
            ))}
          </div>

          <div
            className={`text-xs rounded-lg px-3 py-2 ${
              Math.abs(macroKcal - Number(calories)) <= 50 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            Makros = {macroKcal} kcal
            {Math.abs(macroKcal - Number(calories)) > 50 && (
              <span className="ml-1">(Abweichung {Math.abs(macroKcal - Number(calories))} kcal vom Ziel)</span>
            )}
          </div>
        </div>

        {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ {error}</div>}

        <div className="flex gap-3">
          <Link
            href="/admin/nutrition"
            className="flex-1 py-3 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 text-center transition-colors"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Erstellen...' : 'Plan erstellen & bearbeiten ->'}
          </button>
        </div>
      </form>
    </div>
  )
}

