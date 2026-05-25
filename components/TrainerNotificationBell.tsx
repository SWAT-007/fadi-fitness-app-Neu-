'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Notification, NotificationType } from '@/lib/types'
const trainerBellTypes = ['workout', 'checkin', 'training_plan', 'workout_plan', 'nutrition_plan', 'request'] as const
type TrainerBellType = typeof trainerBellTypes[number]
const isTrainerBellNotification = (notification: Notification): notification is Notification & { type: TrainerBellType } =>
  trainerBellTypes.includes(notification.type as TrainerBellType)

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const BellIcon = (
  <svg viewBox="0 0 24 24" {...stroke}>
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
)

const TypeIcon: Record<NotificationType, ReactNode> = {
  message: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 3.5V17H6a2 2 0 01-2-2V6z" />
    </svg>
  ),
  workout: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" />
    </svg>
  ),
  checkin: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  training_plan: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  workout_plan: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  nutrition_plan: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M12 21c-4 0-7-3.5-7-8 0-3 2-5 4-5 1.2 0 1.8.5 3 .5s1.8-.5 3-.5c2 0 4 2 4 5 0 4.5-3 8-7 8z" />
      <path d="M12 8c0-2.5 1.5-4 4-4" />
    </svg>
  ),
  request: (
    <svg viewBox="0 0 24 24" {...stroke}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
}

const TypeColor: Record<NotificationType, string> = {
  message:       'bg-indigo-50 text-indigo-600 ring-indigo-100',
  workout:       'bg-emerald-50 text-emerald-600 ring-emerald-100',
  checkin:       'bg-violet-50 text-violet-600 ring-violet-100',
  training_plan: 'bg-blue-50 text-blue-600 ring-blue-100',
  workout_plan:  'bg-blue-50 text-blue-600 ring-blue-100',
  nutrition_plan:'bg-orange-50 text-orange-600 ring-orange-100',
  request:       'bg-indigo-50 text-indigo-600 ring-indigo-100',
}

const TypeHref: Record<NotificationType, string> = {
  message:       '/admin/messages',
  workout:       '/admin/clients',
  checkin:       '/admin/clients',
  training_plan: '/admin/plans',
  workout_plan:  '/admin/plans',
  nutrition_plan:'/admin/nutrition',
  request:       '/admin/requests',
}

function timeAgo(value: string) {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (diff < 60) return 'gerade eben'
  const m = Math.floor(diff / 60)
  if (m < 60) return `vor ${m} ${m === 1 ? 'Minute' : 'Minuten'}`
  const h = Math.floor(m / 60)
  if (h < 24) return `vor ${h} ${h === 1 ? 'Stunde' : 'Stunden'}`
  const d = Math.floor(h / 24)
  if (d < 7) return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`
  return new Date(value).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

export default function TrainerNotificationBell({ trainerId, theme = 'dark' }: { trainerId: string; theme?: 'dark' | 'light' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const channelIdRef = useRef<string | null>(null)

  const append = useCallback((n: Notification) => {
    if (!isTrainerBellNotification(n)) return
    setNotifications(prev => {
      if (prev.some(x => x.id === n.id)) return prev
      return [n, ...prev].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })
  }, [])

  useEffect(() => {
    supabase
      .from('notifications')
      .select('*')
      .eq('client_id', trainerId)
      .in('type', [...trainerBellTypes])
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications(((data ?? []) as Notification[]).filter(isTrainerBellNotification)))
  }, [trainerId])

  useEffect(() => {
    channelIdRef.current ??= globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
    const ch = supabase.channel(`trainer-notifications-${trainerId}-${channelIdRef.current}`)
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `client_id=eq.${trainerId}` },
      payload => append(payload.new as Notification)
    )
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [trainerId, append])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  const unread = notifications.filter(n => !n.is_read).length

  const markAllRead = async () => {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    if (error) setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, is_read: false } : n))
  }

  const handleClick = async (n: Notification) => {
    setOpen(false)
    if (!n.is_read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    }
    router.push(TypeHref[n.type])
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Benachrichtigungen"
        aria-expanded={open}
        className={`press relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          theme === 'dark'
            ? 'text-gray-400 hover:text-gray-300 hover:bg-white/[0.06]'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <span className="w-[18px] h-[18px] block">{BellIcon}</span>

        {/* Badge */}
        <span
          className={`absolute -right-1 -top-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 transition-transform duration-200 ${
            theme === 'dark' ? 'ring-[#0b0c0f]' : 'ring-white'
          }`}
          style={{ transform: unread > 0 ? 'scale(1)' : 'scale(0)', transformOrigin: 'center' }}
          aria-hidden={unread === 0}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="bubble-in absolute bottom-full mb-2 right-0 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.08] bg-[#111318] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] overflow-hidden"
          style={{ transformOrigin: 'bottom right' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
            <div>
              <p className="text-[13.5px] font-semibold text-white tracking-tight">Benachrichtigungen</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}
              </p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="press text-[11.5px] font-medium text-indigo-400 hover:text-indigo-300 disabled:text-gray-600 disabled:cursor-default transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.05]"
            >
              Alle lesen
            </button>
          </div>

          {/* List */}
          <div className="max-h-[min(22rem,calc(100vh-12rem))] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto w-10 h-10 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] flex items-center justify-center text-gray-500 mb-3">
                  <span className="w-5 h-5 block">{BellIcon}</span>
                </div>
                <p className="text-[13px] text-gray-500">Keine Benachrichtigungen</p>
              </div>
            ) : (
              notifications.filter(isTrainerBellNotification).map((n, i) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`press w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                    i !== 0 ? 'border-t border-white/[0.04]' : ''
                  } ${!n.is_read ? 'bg-indigo-500/[0.06]' : ''}`}
                >
                  {/* Type icon badge */}
                  <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ring-1 ring-inset ${TypeColor[n.type]}`}>
                    <span className="w-4 h-4 block">{TypeIcon[n.type]}</span>
                  </span>

                  <span className="flex-1 min-w-0">
                    <span className={`block text-[13px] leading-snug truncate ${n.is_read ? 'text-gray-400' : 'text-white font-medium'}`}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block truncate text-[11.5px] text-gray-500 mt-0.5">{n.body}</span>
                    )}
                    <span className="block text-[11px] text-gray-600 mt-1 tabular-nums">{timeAgo(n.created_at)}</span>
                  </span>

                  {!n.is_read && (
                    <span className="shrink-0 mt-2 w-[2px] h-[2px] rounded-full bg-indigo-500" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
