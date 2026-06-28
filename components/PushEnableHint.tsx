'use client'

import { useEffect, useState } from 'react'
import { enablePushNotifications, isPushSupported, pushPermission } from '@/lib/pushNotifications'

// Small, non-nagging hint shown inside the notification dropdown. Only appears
// when push is supported and permission is still "default". When already
// granted it silently (re)registers the subscription and renders nothing.
export default function PushEnableHint() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setPermission(pushPermission())
  }, [])

  useEffect(() => {
    if (permission === 'granted') {
      void enablePushNotifications().catch(() => undefined)
    }
  }, [permission])

  if (!isPushSupported()) return null
  if (done || permission !== 'default') return null

  const handleEnable = async () => {
    setBusy(true)
    const ok = await enablePushNotifications().catch(() => false)
    setBusy(false)
    setPermission(pushPermission())
    if (ok) setDone(true)
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-[rgba(167,139,250,0.06)] px-4 py-2.5">
      <span className="text-xs text-[#A0A0A8]">Push-Benachrichtigungen aktivieren?</span>
      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="rounded-lg bg-[#A78BFA] px-2.5 py-1 text-xs font-semibold text-[#050504] transition-colors hover:bg-[#B79FFB] disabled:opacity-50"
      >
        {busy ? '…' : 'Aktivieren'}
      </button>
    </div>
  )
}
