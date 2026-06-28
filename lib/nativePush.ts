// Native (Capacitor / Android) push via Firebase Cloud Messaging.
//
// The web bundle is loaded *live* inside the Capacitor WebView, so we must not
// import the plugin at module top level (that would run during SSR and in plain
// browsers). Instead we detect the native runtime via the injected
// `window.Capacitor` bridge and dynamic-import the plugin only when needed.
// Every function is a safe no-op in the browser/PWA, so the web push flow stays
// completely unaffected.

type CapacitorGlobal = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

// True only inside the Capacitor Android WebView (not browser, not iOS).
export function isNativeAndroid(): boolean {
  const cap = capacitor()
  return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === 'android')
}

let listenersBound = false

// Binds the push listeners exactly once. Safe to call on every mount.
// `navigate` is used for deep links when a notification is tapped.
export async function initNativePush(navigate: (url: string) => void): Promise<void> {
  if (!isNativeAndroid() || listenersBound) return
  listenersBound = true

  const { PushNotifications } = await import('@capacitor/push-notifications')

  // FCM token issued → register it against the existing subscribe endpoint.
  await PushNotifications.addListener('registration', async (token) => {
    try {
      await fetch('/api/backend/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'ANDROID_APK', endpoint: token.value }),
      })
    } catch (err) {
      console.error('[nativePush] subscribe failed', err)
    }
  })

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('[nativePush] registration error', err)
  })

  // Notification tapped → deep-link to data.url (fallback /client).
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = action.notification?.data?.url
    navigate(typeof url === 'string' && url ? url : '/client')
  })
}

type NativePermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unsupported'

export async function nativePushPermission(): Promise<NativePermission> {
  if (!isNativeAndroid()) return 'unsupported'
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const status = await PushNotifications.checkPermissions()
  return status.receive
}

// Requests permission (if needed) and registers with FCM. The token arrives via
// the 'registration' listener bound in initNativePush(). Returns true on grant.
export async function enableNativePush(): Promise<boolean> {
  if (!isNativeAndroid()) return false
  const { PushNotifications } = await import('@capacitor/push-notifications')

  let status = await PushNotifications.checkPermissions()
  if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
    status = await PushNotifications.requestPermissions()
  }
  if (status.receive !== 'granted') return false

  await PushNotifications.register()
  return true
}
