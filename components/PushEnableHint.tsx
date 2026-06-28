'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enablePushNotifications, isPushSupported, pushPermission } from '@/lib/pushNotifications'
import { enableNativePush, initNativePush, isNativeAndroid, nativePushPermission } from '@/lib/nativePush'

// Small, non-nagging hint shown inside the notification dropdown. Picks the right
// transport per runtime: native FCM inside the Capacitor Android WebView, Web
// Push (VAPID) in the browser/PWA. The two flows never overlap — no double
// registration, and web push is never triggered inside the native shell.
export default function PushEnableHint() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [native, setNative] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // ── Capacitor Android (native FCM) ──
      if (isNativeAndroid()) {
        setNative(true)
        // Bind deep-link/registration listeners as early as possible.
        await initNativePush((url) => router.push(url))
        const perm = await nativePushPermission()
        if (cancelled) return
        if (perm === 'granted') {
          // Already granted → silently (re)register the FCM token.
          void enableNativePush().catch(() => undefined)
          setVisible(false)
        } else if (perm === 'prompt' || perm === 'prompt-with-rationale') {
          setVisible(true)
        } else {
          setVisible(false)
        }
        return
      }

      // ── Browser / PWA (Web Push) ──
      if (!isPushSupported()) {
        setVisible(false)
        return
      }
      const perm = pushPermission()
      if (perm === 'granted') {
        void enablePushNotifications().catch(() => undefined)
        setVisible(false)
      } else if (perm === 'default') {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [router])

  if (done || !visible) return null

  const handleEnable = async () => {
    setBusy(true)
    const ok = native
      ? await enableNativePush().catch(() => false)
      : await enablePushNotifications().catch(() => false)
    setBusy(false)
    if (ok) setDone(true)
    else setVisible(false) // denied → stop nagging
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
