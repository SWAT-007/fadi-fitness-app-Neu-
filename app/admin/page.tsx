'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Client } from '@/lib/types'
import { AnimatedNumber, StaggerItem } from '@/components/Motion'

interface Stats {
  clients: number
  activePlanAssignments: number
  nutritionPlans: number
  pendingRequests: number
  unreadMessages: number
}

interface TrainerDashboardResponse {
  trainer?: {
    id?: string
    userId?: string
    email?: string
    fullName?: string
  } | null
  stats?: {
    clientCount?: number
    activeClientCount?: number
    workoutPlanCount?: number
    activePlanAssignmentCount?: number
    nutritionPlanCount?: number
    pendingRequestCount?: number
    unreadMessageCount?: number
  } | null
  recentClients?: Array<{
    id: string
    fullName?: string
    email?: string
    createdAt?: string
  }> | null
  message?: string
  errorId?: string
}

const withErrorId = (message: string, errorId?: string) =>
  errorId ? `${message} (Fehler-ID: ${errorId})` : message

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
  message: <svg viewBox="0 0 24 24" {...stroke}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 3.5V17H6a2 2 0 01-2-2V6z" /></svg>,
}

type StatCard = {
  label: string
  value: number
  href: string
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
        const response = await fetch('/api/backend/me/trainer-dashboard', { cache: 'no-store' })
        const payload = await response.json().catch(() => null) as TrainerDashboardResponse | null

        if (response.status === 401) {
          setStats({ clients: 0, activePlanAssignments: 0, nutritionPlans: 0, pendingRequests: 0, unreadMessages: 0 })
          setRecentClients([])
          setErrorMessage('Backend-Login erforderlich.')
          return
        }

        if (!response.ok) {
          throw new Error(withErrorId(payload?.message ?? 'Trainer dashboard request failed', payload?.errorId))
        }

        const trainerFullName = payload?.trainer?.fullName?.trim() ?? ''
        setTrainerName(trainerFullName ? trainerFullName.split(' ')[0] ?? '' : '')

        const mappedRecentClients: Client[] = Array.isArray(payload?.recentClients)
          ? payload.recentClients.map((client) => ({
            id: client.id,
            trainer_id: '',
            user_id: null,
            full_name: client.fullName?.trim() || client.email?.trim() || 'Kunde',
            email: client.email ?? '',
            phone: null,
            notes: null,
            created_at: client.createdAt ?? new Date(0).toISOString(),
          }))
          : []

        setStats({
          clients: payload?.stats?.clientCount ?? 0,
          activePlanAssignments: payload?.stats?.activePlanAssignmentCount ?? 0,
          nutritionPlans: payload?.stats?.nutritionPlanCount ?? 0,
          pendingRequests: payload?.stats?.pendingRequestCount ?? 0,
          unreadMessages: payload?.stats?.unreadMessageCount ?? 0,
        })
        setRecentClients(mappedRecentClients)
      } catch (error) {
        console.error('Failed to load admin dashboard', error)
        setStats({ clients: 0, activePlanAssignments: 0, nutritionPlans: 0, pendingRequests: 0, unreadMessages: 0 })
        setRecentClients([])
        setErrorMessage(error instanceof Error ? error.message : 'Dashboard-Daten konnten gerade nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards: StatCard[] = [
    { label: 'Kunden', value: stats.clients, href: '/admin/clients', icon: Icon.users },
    { label: 'Aktive Pläne', value: stats.activePlanAssignments, href: '/admin/plans', icon: Icon.plans },
    { label: 'Ernährungspläne', value: stats.nutritionPlans, href: '/admin/nutrition', icon: Icon.flame },
    { label: 'Anfragen', value: stats.pendingRequests, href: '/admin/requests', icon: Icon.sparkle },
    { label: 'Nachrichten', value: stats.unreadMessages, href: '/admin/messages', icon: Icon.message },
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
        <div className="w-8 h-8 border-4 border-[#A78BFA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-5 lg:px-8 py-6 lg:py-8 max-w-6xl mx-auto">

      {/* Hero trainer card — image 2 */}
      <div className="relative overflow-hidden rounded-3xl mb-6 h-[220px] lg:h-[280px]">
        <Image
          src="/images/app-style/2.jpeg"
          alt="Trainer"
          fill
          className="object-cover object-top"
          style={{ filter: 'brightness(0.5) contrast(1.15)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050504]/90 via-[#050504]/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050504]/60 to-transparent" />
        {/* purple rim accent */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-[#A78BFA]/0 via-[#A78BFA]/40 to-[#A78BFA]/0" />

        <div className="absolute inset-0 flex flex-col justify-end p-6 lg:p-8">
          <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-[#A78BFA] mb-1">{dateLabel}</p>
          <h1 className="text-[28px] lg:text-[36px] font-bold text-white tracking-tight leading-tight">
            {greeting}{trainerName ? `, ${trainerName}` : ''}.
          </h1>
          <p className="text-white/60 text-[13px] mt-1">Hier ist dein heutiger Überblick.</p>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {errorMessage}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {statCards.map((card, i) => (
          <StaggerItem key={card.label} index={i}>
            <Link
              href={card.href}
              className="lift press group relative flex flex-col gap-3 p-4 rounded-2xl bg-[#111111] border border-white/[0.06] hover:border-[#A78BFA]/20 hover:bg-[#181818] transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/10 flex items-center justify-center text-[#A78BFA]">
                <span className="w-4.5 h-4.5 block">{card.icon}</span>
              </div>
              <div>
                <p className="text-[28px] font-bold text-[#EDECEA] tabular-nums leading-none">
                  <AnimatedNumber value={card.value} />
                </p>
                <p className="text-[11.5px] text-[#797D83] mt-1">{card.label}</p>
              </div>
            </Link>
          </StaggerItem>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <Link
          href="/admin/clients/new"
          className="lift press group relative overflow-hidden rounded-2xl p-5 flex items-center gap-4 bg-[#A78BFA] shadow-[0_8px_32px_-12px_rgba(167,139,250,0.45)]"
        >
          <span className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative w-11 h-11 rounded-xl bg-black/15 flex items-center justify-center">
            <span className="w-5 h-5 block text-[#050504]">{Icon.plus}</span>
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="font-bold text-[#050504] tracking-tight">Neuen Kunden anlegen</div>
            <div className="text-[#050504]/60 text-[13px] mt-0.5">Profil, Ziele, Plan zuweisen</div>
          </div>
          <span className="relative w-4 h-4 text-[#050504]/60 transition-transform duration-200 group-hover:translate-x-0.5">{Icon.arrow}</span>
        </Link>
        <Link
          href="/admin/plans/new"
          className="lift press group relative overflow-hidden rounded-2xl p-5 flex items-center gap-4 bg-[#111111] border border-white/[0.06] hover:border-white/[0.1] hover:bg-[#181818]"
        >
          <div className="w-11 h-11 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#797D83]">
            <span className="w-5 h-5 block">{Icon.sparkle}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[#EDECEA] tracking-tight">Trainingsplan erstellen</div>
            <div className="text-[#797D83] text-[13px] mt-0.5">Wochenplan oder Vorlage</div>
          </div>
          <span className="w-4 h-4 text-[#797D83] transition-transform duration-200 group-hover:translate-x-0.5">{Icon.arrow}</span>
        </Link>
      </div>

      {/* Recent Clients */}
      <div className="bg-[#111111] rounded-2xl border border-white/[0.06] overflow-hidden">
        <div className="px-5 lg:px-6 py-4 flex items-center justify-between border-b border-white/[0.06]">
          <div>
            <h2 className="font-bold text-[#EDECEA] tracking-tight">Neueste Kunden</h2>
            <p className="text-[12.5px] text-[#797D83] mt-0.5">Zuletzt hinzugefügt</p>
          </div>
          <Link
            href="/admin/clients"
            className="press text-[13px] font-medium text-[#A78BFA] hover:text-[#B79FFB] inline-flex items-center gap-1 px-2 py-1 -mr-2 rounded-lg hover:bg-[#A78BFA]/[0.08]"
          >
            Alle anzeigen
            <span className="w-3.5 h-3.5">{Icon.arrow}</span>
          </Link>
        </div>
        {recentClients.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#797D83]">
              <span className="w-6 h-6 block">{Icon.users}</span>
            </div>
            <p className="mt-3 text-[#797D83] text-sm">Noch keine Kunden.</p>
            <Link
              href="/admin/clients/new"
              className="press inline-flex items-center gap-1.5 mt-3 px-3.5 py-2 rounded-xl bg-[#A78BFA] text-[#050504] text-[13px] font-bold"
            >
              <span className="w-3.5 h-3.5">{Icon.plus}</span> Ersten Kunden hinzufügen
            </Link>
          </div>
        ) : (
          <ul>
            {recentClients.map((client, index) => (
              <li key={client.id} className={index !== 0 ? 'border-t border-white/[0.04]' : ''}>
                <StaggerItem index={index}>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="press group flex items-center gap-4 px-5 lg:px-6 py-3.5 hover:bg-white/[0.03]"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#A78BFA]/15 border border-[#A78BFA]/20 text-[#A78BFA] flex items-center justify-center font-bold text-[13px]">
                      {client.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[#EDECEA] text-[14px] truncate tracking-tight">{client.full_name}</div>
                      <div className="text-[#797D83] text-[12.5px] truncate">{client.email}</div>
                    </div>
                    <span className="w-4 h-4 text-[#797D83]/40 group-hover:text-[#797D83] transition-transform duration-200 group-hover:translate-x-0.5">
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
