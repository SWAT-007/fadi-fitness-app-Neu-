import * as webpush from "web-push";
import { prisma } from "../db";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  type?: string;
};

let vapidConfigured = false;
let vapidWarned = false;

// Configure web-push lazily so the API still boots when VAPID keys are absent
// (e.g. local dev). Returns false when push is not configured.
function ensureVapid(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:info@mila-coach.com";

  if (!publicKey || !privateKey) {
    if (!vapidWarned) {
      console.warn("[push] VAPID keys missing — web push disabled.");
      vapidWarned = true;
    }
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

// Sends a web push to every browser/PWA device of a user. Fire-and-forget safe:
// it never throws, so callers can `void sendPushToUser(...)` without try/catch.
// Native ANDROID_APK subscriptions are intentionally skipped here (reserved for a
// later FCM phase). Expired subscriptions (404/410) are pruned automatically.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    if (!ensureVapid()) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId, platform: { in: ["WEB_PWA", "IOS_PWA"] } },
    });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url ?? "/login",
      type: payload.type ?? "system",
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh ?? "", auth: sub.auth ?? "" },
            },
            body,
          );
          await prisma.pushSubscription
            .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
            .catch(() => undefined);
        } catch (err) {
          const status =
            err instanceof webpush.WebPushError ? err.statusCode : undefined;
          if (status === 404 || status === 410) {
            // Subscription expired/unsubscribed → remove it.
            await prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
          } else {
            console.error("[push] send error:", status ?? err);
          }
        }
      }),
    );
  } catch (err) {
    console.error("[push] sendPushToUser failed:", err);
  }
}
