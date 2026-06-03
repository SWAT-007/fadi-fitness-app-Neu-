import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/** Short tap — used when checking off a set. Falls back to web vibration. */
export async function tapLight(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light })
    } else {
      ;(navigator as unknown as { vibrate?: (p: number | number[]) => void }).vibrate?.(20)
    }
  } catch {
    // Haptics unavailable (no hardware / permission) — ignore.
  }
}

/** Success buzz — used when a workout is completed. Falls back to web vibration. */
export async function successBuzz(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.notification({ type: NotificationType.Success })
    } else {
      ;(navigator as unknown as { vibrate?: (p: number | number[]) => void }).vibrate?.([40, 60, 120])
    }
  } catch {
    // Haptics unavailable (no hardware / permission) — ignore.
  }
}
