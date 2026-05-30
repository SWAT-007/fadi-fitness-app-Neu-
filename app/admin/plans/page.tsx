'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { WorkoutPlan } from '@/lib/types'
import { AnimatedNumber, StaggerItem, SuccessButton, useToast } from '@/components/Motion'

type BackendPlan = {
  id: string
  name: string
  title?: string
  description: string | null
  createdAt: string
  updatedAt: string
  dayCount?: number
}

type BackendClient = {
  id: string
  name?: string
  displayName?: string
}

export default function PlansPage() {
  const { showToast } = useToast()
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [clients, setClients] = useState<BackendClient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignClientId, setAssignClientId] = useState('')
  const [assignPlanId, setAssignPlanId] = useState('')
  const [assignError, setAssignError] = useState('')
  const [assignSuccess, setAssignSuccess] = useState('')
  const [assignDone, setAssignDone] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const plansResponse = await fetch('/api/backend/plans', { cache: 'no-store' })
      const plansPayload = await plansResponse.json().catch(() => null)
      if (!plansResponse.ok) {
        if (plansResponse.status === 401) {
          setError('Backend-Login erforderlich.')
        } else {
          setError((plansPayload && typeof plansPayload.message === 'string' && plansPayload.message) || 'Pläne konnten nicht geladen werden.')
        }
        setPlans([])
      } else {
        const backendPlans = Array.isArray(plansPayload?.plans) ? plansPayload.plans as BackendPlan[] : []
        setPlans(
          backendPlans.map((plan) => ({
            id: plan.id,
            name: plan.name ?? plan.title ?? '',
            description: plan.description,
            created_at: plan.createdAt,
            workout_days: Array.from({ length: plan.dayCount ?? 0 }, (_, idx) => ({ id: `day-${idx}` })),
          })) as WorkoutPlan[],
        )
      }

      const clientsResponse = await fetch('/api/backend/clients', { cache: 'no-store' })
      const clientsPayload = await clientsResponse.json().catch(() => null)
      if (!clientsResponse.ok) {
        if (clientsResponse.status === 401 && !error) {
          setError('Backend-Login erforderlich.')
        }
        setClients([])
      } else {
        const backendClients = Array.isArray(clientsPayload?.clients) ? clientsPayload.clients as BackendClient[] : []
        setClients(backendClients)
      }
    } catch {
      setError('Pläne konnten nicht geladen werden.')
      setPlans([])
      setClients([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignClientId || !assignPlanId) return

    setAssigning(true)
    setAssignError('')
    setAssignSuccess('')

    const response = await fetch(`/api/backend/plans/${assignPlanId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: assignClientId }),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 401) {
        setAssignError('Backend-Login erforderlich.')
      } else {
        setAssignError((payload && typeof payload.message === 'string' && payload.message) || 'Plan konnte nicht zugewiesen werden.')
      }
      setAssigning(false)
      return
    }

    setAssignClientId('')
    setAssignPlanId('')
    setAssignSuccess('Plan wurde zugewiesen.')
    setAssignDone(true)
    showToast('Plan zugewiesen ✓', 'success')
    window.setTimeout(() => setAssignDone(false), 1500)
    setAssigning(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const response = await fetch(`/api/backend/plans/${deleteId}`, {
      method: 'DELETE',
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    setDeleteId(null)
    if (response.ok) {
      showToast('Plan gelöscht', 'danger')
    } else if (response.status === 401) {
      showToast('Backend-Login erforderlich.', 'danger')
    } else {
      showToast((payload && typeof payload.message === 'string' && payload.message) || 'Plan konnte nicht gelöscht werden.', 'danger')
    }
    await load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#EDECEA]">Trainingspläne</h1>
          <p className="text-[#797D83] text-sm mt-1"><AnimatedNumber value={plans.length} /> Pläne erstellt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/exercises"
            className="border border-white/[0.08] hover:bg-[#050504] text-[#EDECEA] text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            Übungs-Datenbank
          </Link>
          <Link
            href="/admin/plans/new"
            className="bg-[#A78BFA] hover:bg-[#B79FFB] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Neuer Plan
          </Link>
        </div>
      </div>

      <form onSubmit={handleAssignPlan} className="bg-[#111111] rounded-2xl border border-white/[0.06] p-5 shadow-sm mb-6">
        <h2 className="font-semibold text-[#EDECEA] mb-4">Plan zuweisen</h2>

        {assignError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
            {assignError}
          </div>
        )}
        {assignSuccess && (
          <div className="bg-[#A78BFA]/10 border border-[#A78BFA]/20 text-[#A78BFA] text-sm px-4 py-3 rounded-xl mb-4">
            {assignSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
          <select
            value={assignClientId}
            onChange={e => {
              setAssignClientId(e.target.value)
              setAssignSuccess('')
            }}
            className="px-3 py-2.5 border border-white/[0.08] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/30 focus:border-transparent"
          >
            <option value="">Client auswaehlen</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.displayName ?? client.name ?? 'Unbenannt'}</option>
            ))}
          </select>

          <select
            value={assignPlanId}
            onChange={e => {
              setAssignPlanId(e.target.value)
              setAssignSuccess('')
            }}
            className="px-3 py-2.5 border border-white/[0.08] rounded-xl text-sm focus:ring-2 focus:ring-[#A78BFA]/30 focus:border-transparent"
          >
            <option value="">Plan auswaehlen</option>
            {plans.map(plan => (
              <option key={plan.id} value={plan.id}>{plan.name}</option>
            ))}
          </select>

          <SuccessButton
            type="submit"
            disabled={!assignClientId || !assignPlanId || assigning}
            success={assignDone}
            className="px-4 py-2.5 bg-[#A78BFA] hover:bg-[#B79FFB] text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {assigning ? 'Speichern...' : 'Zuweisen'}
          </SuccessButton>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-[#111111] rounded-2xl border border-red-500/20 py-10 text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-[#111111] rounded-2xl border border-white/[0.06] py-16 text-center">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-[#797D83] mb-3">Noch keine Pläne erstellt.</p>
          <Link href="/admin/plans/new" className="text-[#A78BFA] text-sm hover:underline">
            Ersten Plan erstellen
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan, index) => {
            const dayCount = (plan as WorkoutPlan & { workout_days: { id: string }[] }).workout_days?.length ?? 0
            return (
              <StaggerItem key={plan.id} index={index} className="bg-[#111111] rounded-2xl border border-white/[0.06] shadow-sm hover:shadow-md transition-shadow group">
                <Link href={`/admin/plans/${plan.id}`} className="block p-5">
                  <div className="w-10 h-10 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center text-xl mb-4">📋</div>
                  <h3 className="font-semibold text-[#EDECEA] mb-1">{plan.name}</h3>
                  {plan.description && <p className="text-sm text-[#797D83] mb-3 line-clamp-2">{plan.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-[#797D83]">
                    <span>{dayCount} Trainingstag{dayCount !== 1 ? 'e' : ''}</span>
                    <span>·</span>
                    <span>{new Date(plan.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                </Link>
                <div className="px-5 pb-4 flex gap-2 border-t border-white/[0.06] pt-3">
                  <Link
                    href={`/admin/plans/${plan.id}`}
                    className="flex-1 text-center text-xs text-[#A78BFA] hover:text-[#A78BFA] font-medium py-1.5 rounded-lg hover:bg-[#A78BFA]/10 transition-colors"
                  >
                    Bearbeiten
                  </Link>
                  <button
                    onClick={() => setDeleteId(plan.id)}
                    className="flex-1 text-xs text-red-500 hover:text-red-400 font-medium py-1.5 rounded-lg hover:bg-red-500/100/10 transition-colors"
                  >
                    Löschen
                  </button>
                </div>
              </StaggerItem>
            )
          })}
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#111111] rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="font-semibold text-[#EDECEA] mb-2">Plan löschen?</h3>
            <p className="text-[#797D83] text-sm mb-6">Alle Trainingstage und Übungen werden mitgelöscht.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-white/[0.08] text-[#EDECEA] text-sm font-medium rounded-xl hover:bg-[#050504]">Abbrechen</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
