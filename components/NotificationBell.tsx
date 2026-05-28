'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const clientNotificationTypes = ['workout_plan', 'nutrition_plan', 'request'] as const
type ClientNotificationType = typeof clientNotificationTypes[number]

interface BellNotification {
  id: string
  user_id: string
  type: string
  title: string
  body?: string | null
  is_read: boolean
  created_at: string
}

const isClientNotification = (
  notification: BellNotification,
): notification is BellNotification & { type: ClientNotificationType } =>
  clientNotificationTypes.includes(notification.type as ClientNotificationType)

const typeIcon: Record<ClientNotificationType, string> = {
  workout_plan: 'Plan',
  nutrition_plan: 'Food',
  request: 'OK',
}

const typeHref: Record<ClientNotificationType, string> = {
  workout_plan: '/client/plan',
  nutrition_plan: '/client/nutrition',
  request: '/client/plan',
}

function timeAgo(value: string) {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (diffSeconds < 60) return 'gerade eben'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `vor ${diffMinutes} ${diffMinutes === 1 ? 'Minute' : 'Minuten'}`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `vor ${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'}`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`
  return new Date(value).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

export default function NotificationBell({
  clientUserId: _clientUserId,
}: {
  clientUserId: string
}) {
  void _clientUserId
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<BellNotification[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/backend/me/notifications?limit=30', {
          method: 'GET',
          cache: 'no-store',
        })
        if (!response.ok) return

        const payload = await response.json().catch(() => null) as {
          notifications?: BellNotification[]
        } | null

        setNotifications((payload?.notifications ?? []).filter(isClientNotification))
      } catch {
        setNotifications([])
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const unreadCount = notifications.filter(notification => !notification.is_read).length

  const markAllRead = async () => {
    const unreadIds = notifications.filter(notification => !notification.is_read).map(notification => notification.id)
    if (unreadIds.length === 0) return

    setNotifications(prev => prev.map(notification => ({ ...notification, is_read: true })))
    try {
      const response = await fetch('/api/backend/me/notifications/read-all', {
        method: 'PATCH',
      })

      if (response.ok) return
    } catch {
      // Fall through to rollback.
    }

    setNotifications(prev => prev.map(notification => (
      unreadIds.includes(notification.id) ? { ...notification, is_read: false } : notification
    )))
  }

  const openNotification = async (notification: BellNotification & { type: ClientNotificationType }) => {
    setOpen(false)
    if (!notification.is_read) {
      setNotifications(prev => prev.map(item => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )))

      try {
        const response = await fetch(`/api/backend/me/notifications/${notification.id}/read`, {
          method: 'PATCH',
        })

        if (!response.ok) {
          setNotifications(prev => prev.map(item => (
            item.id === notification.id ? { ...item, is_read: false } : item
          )))
        }
      } catch {
        setNotifications(prev => prev.map(item => (
          item.id === notification.id ? { ...item, is_read: false } : item
        )))
      }
    }

    router.push(typeHref[notification.type])
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="relative w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg transition-colors"
        aria-label="Benachrichtigungen"
        aria-expanded={open}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-3 top-16 z-50 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl sm:absolute sm:right-0 sm:top-11">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Benachrichtigungen</div>
              <div className="text-xs text-gray-400">{unreadCount} ungelesen</div>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="text-xs font-medium text-emerald-600 disabled:text-gray-300"
            >
              Alle als gelesen markieren
            </button>
          </div>

          <div className="max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Keine Benachrichtigungen.
              </div>
            ) : (
              notifications.filter(isClientNotification).map(notification => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    notification.is_read ? 'bg-white' : 'bg-emerald-50/60'
                  }`}
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-semibold text-indigo-600 shadow-sm ring-1 ring-gray-100">
                    {typeIcon[notification.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-snug ${notification.is_read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>
                      {notification.title}
                    </span>
                    {notification.body && (
                      <span className="mt-0.5 block text-xs leading-snug text-gray-400">{notification.body}</span>
                    )}
                    <span className="mt-1 block text-xs text-gray-400">{timeAgo(notification.created_at)}</span>
                  </span>
                  {!notification.is_read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
