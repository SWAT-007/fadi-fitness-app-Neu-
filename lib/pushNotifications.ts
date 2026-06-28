// Client-side Web Push helpers. Every function degrades gracefully (no-ops)
// when the browser lacks support or VAPID is not configured.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

function detectPlatform(): 'WEB_PWA' | 'IOS_PWA' {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) ? 'IOS_PWA' : 'WEB_PWA'
}

// VAPID public key (base64url) → ArrayBuffer for pushManager.subscribe
// (a plain ArrayBuffer is an unambiguous BufferSource for applicationServerKey).
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return buffer
}

// Requests permission (if needed), subscribes through the service worker, and
// registers the subscription with the backend. Returns true on success.
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
    })
  }

  const json = subscription.toJSON()
  const res = await fetch('/api/backend/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: json.keys,
      platform: detectPlatform(),
    }),
  })
  return res.ok
}

// Unsubscribes locally and removes the subscription from the backend.
export async function disablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return true

  await fetch('/api/backend/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined)

  await subscription.unsubscribe().catch(() => false)
  return true
}
