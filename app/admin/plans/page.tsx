'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Client, WorkoutPlan } from '@/lib/types'
import { AnimatedNumber, StaggerItem, SuccessButton, useToast } from '@/components/Motion'

export default function PlansPage() {
  const { showToast } = useToast()
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [assignClientId, setAssignClientId] = useState('')
  const [assignPlanId, setAssignPlanId] = useState('')
  const [assignError, setAssignError] = useState('')
  const [assignSuccess, setAssignSuccess] = useState('')
  const [assignDone, setAssignDone] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [plansRes, clientsRes] = await Promise.all([
      supabase
        .from('workout_plans')
        .select('*, workout_days(id)')
        .eq('trainer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('clients')
        .select('*')
        .eq('trainer_id', user.id)
        .order('full_name'),
    ])
    setPlans(plansRes.data ?? [])
    setClients(clientsRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignClientId || !assignPlanId) return

    setAssigning(true)
    setAssignError('')
    setAssignSuccess('')

    const { error } = await supabase.from('assigned_plans').insert({
      client_id: assignClientId,
      plan_id: assignPlanId,
      is_active: true,
    })

    if (error) {
      setAssignError(error.message)
      setAssigning(false)
      return
    }

    const assignedClient = clients.find(client => client.id === assignClientId)
    const assignedPlan = plans.find(plan => plan.id === assignPlanId)
    if (assignedClient?.user_id) {
      await supabase.from('notifications').insert({
        client_id: assignedClient.user_id,
        type: 'workout_plan',
        title: 'Neuer Trainingsplan zugewiesen',
        body: assignedPlan?.name ?? null,
      })
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
    const { error } = await supabase.from('workout_plans').delete().eq('id', deleteId)
    setDeleteId(null)
    if (!error) showToast('Plan geloescht', 'danger')
    await load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trainingspläne</h1>
          <p className="text-gray-500 text-sm mt-1"><AnimatedNumber value={plans.length} /> Plaene erstellt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/exercises"
            className="border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            Übungs-Datenbank
          </Link>
          <Link
            href="/admin/plans/new"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Neuer Plan
          </Link>
        </div>
      </div>

      <form onSubmit={handleAssignPlan} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Plan zuweisen</h2>

        {assignError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
            {assignError}
          </div>
        )}
        {assignSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-xl mb-4">
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
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">Client auswaehlen</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.full_name}</option>
            ))}
          </select>

          <select
            value={assignPlanId}
            onChange={e => {
              setAssignPlanId(e.target.value)
              setAssignSuccess('')
            }}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {assigning ? 'Speichern...' : 'Zuweisen'}
          </SuccessButton>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-gray-500 mb-3">Noch keine Pläne erstellt.</p>
          <Link href="/admin/plans/new" className="text-indigo-600 text-sm hover:underline">
            Ersten Plan erstellen
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan, index) => {
            const dayCount = (plan as WorkoutPlan & { workout_days: { id: string }[] }).workout_days?.length ?? 0
            return (
              <StaggerItem key={plan.id} index={index} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                <Link href={`/admin/plans/${plan.id}`} className="block p-5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl mb-4">📋</div>
                  <h3 className="font-semibold text-gray-900 mb-1">{plan.name}</h3>
                  {plan.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{plan.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{dayCount} Trainingstag{dayCount !== 1 ? 'e' : ''}</span>
                    <span>·</span>
                    <span>{new Date(plan.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                </Link>
                <div className="px-5 pb-4 flex gap-2 border-t border-gray-100 pt-3">
                  <Link
                    href={`/admin/plans/${plan.id}`}
                    className="flex-1 text-center text-xs text-indigo-600 hover:text-indigo-700 font-medium py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Bearbeiten
                  </Link>
                  <button
                    onClick={() => setDeleteId(plan.id)}
                    className="flex-1 text-xs text-red-500 hover:text-red-600 font-medium py-1.5 rounded-lg hover:bg-red-50 transition-colors"
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
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="font-semibold text-gray-900 mb-2">Plan löschen?</h3>
            <p className="text-gray-500 text-sm mb-6">Alle Trainingstage und Übungen werden mitgelöscht.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50">Abbrechen</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
