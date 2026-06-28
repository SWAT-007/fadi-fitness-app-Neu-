import * as webpush from "web-push";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import type { PushSubscription } from "@prisma/client";
import { prisma } from "../db";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  type?: string;
};

// ── Web Push (VAPID) ─────────────────────────────────────────────────────────

let vapidConfigured = false;
let vapidWarned = false;

// Configure web-push lazily so the API still boots when VAPID keys are absent
// (e.g. local dev). Returns false when web push is not configured.
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

async function sendWebPush(
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<void> {
  if (subscriptions.length === 0) return;
  if (!ensureVapid()) return;

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
          console.error("[push] web send error:", status ?? err);
        }
      }
    }),
  );
}

// ── Android Push (Firebase Cloud Messaging) ─────────────────────────────────

let fcmApp: App | null = null;
let fcmWarned = false;

// Initialise firebase-admin lazily so the API still boots without FCM env.
// Returns the messaging client, or null when FCM is not configured.
function ensureFcm(): Messaging | null {
  if (fcmApp) return getMessaging(fcmApp);

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    if (!fcmWarned) {
      console.warn("[push] Firebase env missing — Android (FCM) push disabled.");
      fcmWarned = true;
    }
    return null;
  }

  // Railway stores the multi-line key with literal \n — restore real newlines.
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  try {
    fcmApp = getApps().length
      ? getApp()
      : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return getMessaging(fcmApp);
  } catch (err) {
    if (!fcmWarned) {
      console.error("[push] Firebase init failed — Android push disabled:", err);
      fcmWarned = true;
    }
    return null;
  }
}

const DEAD_FCM_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

async function sendFcm(
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<void> {
  if (subscriptions.length === 0) return;
  const messaging = ensureFcm();
  if (!messaging) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await messaging.send({
          token: sub.endpoint,
          notification: { title: payload.title, body: payload.body ?? "" },
          data: { url: payload.url ?? "/login", type: payload.type ?? "system" },
          android: { priority: "high" },
        });
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
      } catch (err) {
        const code = (err as { code?: string })?.code ?? "";
        if (DEAD_FCM_CODES.has(code)) {
          // Token unregistered/invalid → remove it.
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
        } else {
          console.error("[push] FCM send error:", code || err);
        }
      }
    }),
  );
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

// Sends a push to every device of a user across transports. Fire-and-forget
// safe: never throws, so callers can `void sendPushToUser(...)`. Web/PWA
// subscriptions go through web-push (VAPID); ANDROID_APK tokens go through FCM.
// Expired/invalid subscriptions are pruned automatically by each transport.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) return;

    const webSubs = subscriptions.filter(
      (s) => s.platform === "WEB_PWA" || s.platform === "IOS_PWA",
    );
    const androidSubs = subscriptions.filter((s) => s.platform === "ANDROID_APK");

    await Promise.all([
      sendWebPush(webSubs, payload),
      sendFcm(androidSubs, payload),
    ]);
  } catch (err) {
    console.error("[push] sendPushToUser failed:", err);
  }
}
