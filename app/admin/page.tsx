'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/lib/types'
import { AnimatedNumber, StaggerItem } from '@/components/Motion'

interface Stats {
  clients: number
  plans: number
  logsToday: number
}

export default function TrainerDashboard() {
  const [stats, setStats] = useState<Stats>({ clients: 0, plans: 0, logsToday: 0 })
  const [recentClients, setRecentClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setErrorMessage(null)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const today = new Date().toISOString().split('T')[0]
        const clientIdsRes = await supabase
          .from('clients')
          .select('id')
          .eq('trainer_id', user.id)

        if (clientIdsRes.error) throw clientIdsRes.error

        const clientIds = clientIdsRes.data?.map(client => client.id) ?? []
        const logsTodayQuery = clientIds.length
          ? supabase
            .from('workout_logs')
            .select('id', { count: 'exact', head: true })
            .in('client_id', clientIds)
            .eq('date', today)
          : Promise.resolve({ count: 0, error: null })

        const [clientsRes, plansRes, logsRes, recentRes] = await Promise.all([
          supabase.from('clients').select('id', { count: 'exact', head: true }).eq('trainer_id', user.id),
          supabase.from('workout_plans').select('id', { count: 'exact', head: true }).eq('trainer_id', user.id),
          logsTodayQuery,
          supabase.from('clients').select('*').eq('trainer_id', user.id).order('created_at', { ascending: false }).limit(5),
        ])

        const firstError = clientsRes.error ?? plansRes.error ?? logsRes.error ?? recentRes.error
        if (firstError) throw firstError

        setStats({
          clients: clientsRes.count ?? 0,
          plans: plansRes.count ?? 0,
          logsToday: logsRes.count ?? 0,
        })
        setRecentClients(recentRes.data ?? [])
      } catch (error) {
        console.error('Failed to load admin dashboard', error)
        setStats({ clients: 0, plans: 0, logsToday: 0 })
        setRecentClients([])
        setErrorMessage('Dashboard-Daten konnten gerade nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards = [
    { label: 'Kunden', value: stats.clients, icon: '👥', href: '/admin/clients', color: 'bg-blue-50 text-blue-600' },
    { label: 'Trainingspläne', value: stats.plans, icon: '📋', href: '/admin/plans', color: 'bg-purple-50 text-purple-600' },
    { label: 'Trainings heute', value: stats.logsToday, icon: '🔥', href: '/admin/clients', color: 'bg-orange-50 text-orange-600' },
  ]

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {statCards.map(card => (
          <Link key={card.label} href={card.href} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1"><AnimatedNumber value={card.value} /></p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${card.color}`}>
                {card.icon}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          href="/admin/clients"
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-5 flex items-center gap-4 transition-colors"
        >
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">👥</div>
          <div>
            <div className="font-semibold">Kunden verwalten</div>
            <div className="text-indigo-200 text-sm">Kunden erstellen & bearbeiten</div>
          </div>
        </Link>
        <Link
          href="/admin/plans"
          className="bg-white hover:bg-gray-50 border border-gray-200 rounded-2xl p-5 flex items-center gap-4 transition-colors"
        >
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-xl">📋</div>
          <div>
            <div className="font-semibold text-gray-900">Trainingsplan erstellen</div>
            <div className="text-gray-500 text-sm">Neuen Plan anlegen</div>
          </div>
        </Link>
      </div>

      {/* Recent Clients */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Neueste Kunden</h2>
          <Link href="/admin/clients" className="text-indigo-600 text-sm hover:underline">Alle anzeigen</Link>
        </div>
        {recentClients.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-gray-500 text-sm">Noch keine Kunden. <Link href="/admin/clients" className="text-indigo-600 hover:underline">Ersten Kunden hinzufügen</Link></p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentClients.map((client, index) => (
              <li key={client.id}>
                <StaggerItem index={index}>
                <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                    {client.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{client.full_name}</div>
                    <div className="text-gray-500 text-xs">{client.email}</div>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                </StaggerItem>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
