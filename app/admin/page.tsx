'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/lib/types'
import { AnimatedNumber, StaggerItem } from '@/components/Motion'

interface Stats {
  clients: number
  activePlanAssignments: number
  nutritionPlans: number
  pendingRequests: number
  unreadMessages: number
}

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const Icon = {
  users: <svg viewBox="0 0 24 24" {...stroke}><circle cx="9" cy="8" r="3.25" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3 3 0 010 6" /><path d="M21 20c0-2.5-1.7-4.7-4-5.6" /></svg>,
  plans: <svg viewBox="0 0 24 24" {...stroke}><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /><path d="M8 3v3M16 3v3" /></svg>,
  flame: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 3s4 4.5 4 8.5a4 4 0 11-8 0c0-1.5.7-2.7 1.5-3.5C9 11 11 12 12 14c1-3-1-5 0-11z" /></svg>,
  arrow: <svg viewBox="0 0 24 24" {...stroke}><path d="M9 5l7 7-7 7" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 5v14M5 12h14" /></svg>,
  sparkle: <svg viewBox="0 0 24 24" {...stroke}><path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5L12 4z" /></svg>,
}

type StatCard = {
  label: string
  value: number
  href: string
  accent: string
  iconBg: string
  iconColor: string
  icon: ReactNode
}

export default function TrainerDashboard() {
  const [stats, setStats] = useState<Stats>({
    clients: 0,
    activePlanAssignments: 0,
    nutritionPlans: 0,
    pendingRequests: 0,
    unreadMessages: 0,
  })
  const [recentClients, setRecentClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [trainerName, setTrainerName] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setErrorMessage(null)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setTrainerName((user.user_metadata?.full_name as string)?.split(' ')[0] ?? '')

        const backendClientsRes = await fetch('/api/backend/clients', { cache: 'no-store' })
        if (backendClientsRes.status === 401) {
          setStats((prev) => ({ ...prev, clients: 0 }))
          setRecentClients([])
          setErrorMessage('Backend-Login erforderlich.')
          return
        }
        const backendClientsPayload = (await backendClientsRes.json().catch(() => null)) as
          | { clients?: Array<{ id: string; name?: string; displayName?: string; email?: string; createdAt?: string }> }
          | null
        const backendClients = Array.isArray(backendClientsPayload?.clients)
          ? backendClientsPayload.clients
          : []
        if (!backendClientsRes.ok) {
          throw new Error('Backend clients request failed')
        }

        const clientIdsRes = await supabase
          .from('clients')
          .select('id')
          .eq('trainer_id', user.id)

        if (clientIdsRes.error) throw clientIdsRes.error

        const clientIds = clientIdsRes.data?.map(client => client.id) ?? []
        const activeAssignmentsQuery = clientIds.length
          ? supabase
            .from('assigned_plans')
            .select('id', { count: 'exact', head: true })
            .in('client_id', clientIds)
            .eq('is_active', true)
          : Promise.resolve({ count: 0, error: null })
        const pendingRequestsQuery = clientIds.length
          ? supabase
            .from('exercise_change_requests')
            .select('id', { count: 'exact', head: true })
            .in('client_id', clientIds)
            .eq('status', 'pending')
          : Promise.resolve({ count: 0, error: null })

        const [activeAssignmentsRes, nutritionPlansRes, pendingRequestsRes, unreadMessagesRes] = await Promise.all([
          activeAssignmentsQuery,
          supabase.from('nutrition_plans').select('id', { count: 'exact', head: true }).eq('trainer_id', user.id),
          pendingRequestsQuery,
          supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id).is('read_at', null),
        ])

        const firstError =
          activeAssignmentsRes.error ??
          nutritionPlansRes.error ??
          pendingRequestsRes.error ??
          unreadMessagesRes.error
        if (firstError) throw firstError

        const mappedRecentClients: Client[] = backendClients
          .slice()
          .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
          .slice(0, 5)
          .map((client) => ({
            id: client.id,
            trainer_id: '',
            user_id: null,
            full_name: client.name ?? client.displayName ?? '',
            email: client.email ?? '',
            phone: null,
            notes: null,
            created_at: client.createdAt ?? new Date(0).toISOString(),
          }))

        setStats({
          clients: backendClients.length,
          activePlanAssignments: activeAssignmentsRes.count ?? 0,
          nutritionPlans: nutritionPlansRes.count ?? 0,
          pendingRequests: pendingRequestsRes.count ?? 0,
          unreadMessages: unreadMessagesRes.count ?? 0,
        })
        setRecentClients(mappedRecentClients)
      } catch (error) {
        console.error('Failed to load admin dashboard', error)
        setStats({
          clients: 0,
          activePlanAssignments: 0,
          nutritionPlans: 0,
          pendingRequests: 0,
          unreadMessages: 0,
        })
        setRecentClients([])
        setErrorMessage('Dashboard-Daten konnten gerade nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards: StatCard[] = [
    {
      label: 'Aktive Kunden', value: stats.clients, href: '/admin/clients',
      accent: 'from-indigo-500/10 to-transparent',
      iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600', icon: Icon.users,
    },
    {
      label: 'Aktive Trainingspläne', value: stats.activePlanAssignments, href: '/admin/plans',
      accent: 'from-violet-500/10 to-transparent',
      iconBg: 'bg-violet-50', iconColor: 'text-violet-600', icon: Icon.plans,
    },
    {
      label: 'Ernährungspläne', value: stats.nutritionPlans, href: '/admin/nutrition',
      accent: 'from-orange-500/10 to-transparent',
      iconBg: 'bg-orange-50', iconColor: 'text-orange-600', icon: Icon.flame,
    },
    {
      label: 'Offene Anfragen', value: stats.pendingRequests, href: '/admin/requests',
      accent: 'from-emerald-500/10 to-transparent',
      iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', icon: Icon.sparkle,
    },
    {
      label: 'Ungelesene Nachrichten', value: stats.unreadMessages, href: '/admin/messages',
      accent: 'from-cyan-500/10 to-transparent',
      iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600', icon: Icon.arrow,
    },
  ]

  const today = new Date()
  const dateLabel = today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const greeting = (() => {
    const h = today.getHours()
    if (h < 11) return 'Guten Morgen'
    if (h < 18) return 'Hallo'
    return 'Guten Abend'
  })()

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-5 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="mb-8">
        <div className="text-[11px] font-medium tracking-[0.14em] uppercase text-gray-400">{dateLabel}</div>
        <h1 className="mt-1 text-[28px] lg:text-[32px] font-semibold text-gray-900 tracking-tight leading-tight">
          {greeting}{trainerName ? `, ${trainerName}` : ''}.
        </h1>
        <p className="text-gray-500 text-[14px] mt-1.5">
          Hier ist ein Überblick über deine Kunden und Pläne.
        </p>
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-6">
        {statCards.map((card, i) => (
          <StaggerItem key={card.label} index={i}>
            <Link
              href={card.href}
              className="lift relative block overflow-hidden rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:border-gray-300/80 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.12)] p-5"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent}`} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-gray-500">{card.label}</p>
                  <p className="text-[32px] font-semibold text-gray-900 mt-1 tracking-tight tabular-nums leading-none">
                    <AnimatedNumber value={card.value} />
                  </p>
                </div>
                <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${card.iconBg} ${card.iconColor} ring-1 ring-inset ring-black/5`}>
                  <span className="w-5 h-5 block">{card.icon}</span>
                </div>
              </div>
            </Link>
          </StaggerItem>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mb-8">
        <Link
          href="/admin/clients/new"
          className="lift press group relative overflow-hidden rounded-2xl p-5 flex items-center gap-4 text-white bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 shadow-[0_8px_24px_-12px_rgba(79,70,229,0.55)]"
        >
          <span className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 blur-2xl" />
          <div className="relative w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
            <span className="w-5 h-5 block">{Icon.plus}</span>
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="font-semibold tracking-tight">Neuen Kunden anlegen</div>
            <div className="text-indigo-100/90 text-[13px] mt-0.5">Profil, Ziele, Plan zuweisen</div>
          </div>
          <span className="relative w-4 h-4 text-white/80 transition-transform duration-200 group-hover:translate-x-0.5">{Icon.arrow}</span>
        </Link>
        <Link
          href="/admin/plans/new"
          className="lift press group relative overflow-hidden rounded-2xl p-5 flex items-center gap-4 bg-white border border-gray-200/70 hover:border-gray-300/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.12)]"
        >
          <div className="w-11 h-11 rounded-xl bg-gray-50 ring-1 ring-inset ring-black/5 flex items-center justify-center text-gray-700">
            <span className="w-5 h-5 block">{Icon.sparkle}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 tracking-tight">Trainingsplan erstellen</div>
            <div className="text-gray-500 text-[13px] mt-0.5">Wochenplan oder Vorlage</div>
          </div>
          <span className="w-4 h-4 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5">{Icon.arrow}</span>
        </Link>
      </div>

      {/* Recent Clients */}
      <div className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="px-5 lg:px-6 py-4 flex items-center justify-between border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 tracking-tight">Neueste Kunden</h2>
            <p className="text-[12.5px] text-gray-500 mt-0.5">Zuletzt hinzugefügt</p>
          </div>
          <Link
            href="/admin/clients"
            className="press text-[13px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 px-2 py-1 -mr-2 rounded-lg hover:bg-indigo-50"
          >
            Alle anzeigen
            <span className="w-3.5 h-3.5">{Icon.arrow}</span>
          </Link>
        </div>
        {recentClients.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-50 ring-1 ring-inset ring-black/5 flex items-center justify-center text-gray-400">
              <span className="w-6 h-6 block">{Icon.users}</span>
            </div>
            <p className="mt-3 text-gray-600 text-sm">Noch keine Kunden.</p>
            <Link
              href="/admin/clients/new"
              className="press inline-flex items-center gap-1.5 mt-3 px-3.5 py-2 rounded-xl bg-gray-900 text-white text-[13px] font-medium hover:bg-gray-800"
            >
              <span className="w-3.5 h-3.5">{Icon.plus}</span> Ersten Kunden hinzufügen
            </Link>
          </div>
        ) : (
          <ul>
            {recentClients.map((client, index) => (
              <li key={client.id} className={index !== 0 ? 'border-t border-gray-100' : ''}>
                <StaggerItem index={index}>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="press group flex items-center gap-4 px-5 lg:px-6 py-3.5 hover:bg-gray-50/70"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center font-semibold text-[13px] ring-2 ring-white shadow-sm">
                      {client.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-[14px] truncate tracking-tight">{client.full_name}</div>
                      <div className="text-gray-500 text-[12.5px] truncate">{client.email}</div>
                    </div>
                    <span className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-transform duration-200 group-hover:translate-x-0.5">
                      {Icon.arrow}
                    </span>
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
