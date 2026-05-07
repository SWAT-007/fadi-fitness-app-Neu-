'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Notification, NotificationType } from '@/lib/types'

const typeIcon: Record<NotificationType, string> = {
  message: '💬',
  training_plan: '💪',
  nutrition_plan: '🥗',
  workout: '⚡',
  checkin: 'OK',
}

const typeHref: Record<NotificationType, string> = {
  message: '/client/messages',
  training_plan: '/client/plan',
  nutrition_plan: '/client/nutrition',
  workout: '/client/plan',
  checkin: '/client/progress',
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

export default function NotificationBell({ clientUserId }: { clientUserId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  const appendNotification = useCallback((notification: Notification) => {
    setNotifications(prev => {
      if (prev.some(existing => existing.id === notification.id)) return prev
      return [notification, ...prev].sort((a, b) => (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
    })
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('client_id', clientUserId)
        .order('created_at', { ascending: false })
        .limit(20)

      setNotifications((data ?? []) as Notification[])
    }
    load()
  }, [clientUserId])

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${clientUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `client_id=eq.${clientUserId}`,
        },
        payload => appendNotification(payload.new as Notification)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [appendNotification, clientUserId])

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
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)

    if (error) {
      setNotifications(prev => prev.map(notification => (
        unreadIds.includes(notification.id) ? { ...notification, is_read: false } : notification
      )))
    }
  }

  const openNotification = async (notification: Notification) => {
    setOpen(false)
    if (!notification.is_read) {
      setNotifications(prev => prev.map(item => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )))
      await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id)
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
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
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

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Keine Benachrichtigungen.
              </div>
            ) : (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    notification.is_read ? 'bg-white' : 'bg-emerald-50/60'
                  }`}
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-base shadow-sm ring-1 ring-gray-100">
                    {typeIcon[notification.type]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${notification.is_read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>
                      {notification.title}
                    </span>
                    {notification.body && (
                      <span className="mt-0.5 block truncate text-xs text-gray-400">{notification.body}</span>
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
