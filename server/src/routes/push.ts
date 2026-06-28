import { Router } from "express";
import { PushPlatform } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { unexpectedErrorResponse } from "../utils/errors";
import { isPushConfigured, sendPushToUser } from "../utils/pushDispatcher";

export const pushRouter = Router();

const WEB_PLATFORMS: PushPlatform[] = [PushPlatform.WEB_PWA, PushPlatform.IOS_PWA];

const normalizePlatform = (value: unknown): PushPlatform => {
  const v = typeof value === "string" ? value.toUpperCase() : "";
  if (v === "IOS_PWA") return PushPlatform.IOS_PWA;
  if (v === "ANDROID_APK") return PushPlatform.ANDROID_APK;
  return PushPlatform.WEB_PWA;
};

// Register / refresh a push subscription for the logged-in user. Idempotent:
// re-subscribing the same endpoint re-binds it to the current user.
pushRouter.post("/subscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const { endpoint, keys, platform } = (req.body ?? {}) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    platform?: string;
  };

  if (!endpoint || typeof endpoint !== "string") {
    return res.status(400).json({ message: "endpoint required" });
  }

  const p256dh = keys?.p256dh ?? null;
  const auth = keys?.auth ?? null;
  const userAgent = req.header("user-agent") ?? null;
  const resolvedPlatform = normalizePlatform(platform);

  try {
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, userAgent, platform: resolvedPlatform },
      update: { userId, p256dh, auth, userAgent, platform: resolvedPlatform, lastUsedAt: new Date() },
      select: { id: true, platform: true, createdAt: true },
    });
    return res.status(201).json({ ok: true, subscription });
  } catch (error) {
    return unexpectedErrorResponse(res, "push:subscribe", error);
  }
});

// Remove a subscription. Scoped to the caller's own endpoint only.
pushRouter.delete("/subscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const { endpoint } = (req.body ?? {}) as { endpoint?: string };

  if (!endpoint || typeof endpoint !== "string") {
    return res.status(400).json({ message: "endpoint required" });
  }

  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return res.json({ ok: true });
  } catch (error) {
    return unexpectedErrorResponse(res, "push:unsubscribe", error);
  }
});

// Send a generic test push to the caller's own devices.
pushRouter.post("/test", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  try {
    await sendPushToUser(userId, {
      title: "MilaCoach",
      body: "Test-Benachrichtigung – Push funktioniert ✓",
      url: "/login",
      type: "system",
    });
    return res.json({ ok: true });
  } catch (error) {
    return unexpectedErrorResponse(res, "push:test", error);
  }
});

// Whether the caller has any active web subscription (for the enable UI).
pushRouter.get("/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  try {
    const devices = await prisma.pushSubscription.count({
      where: { userId, platform: { in: WEB_PLATFORMS } },
    });
    return res.json({
      ok: true,
      configured: isPushConfigured(),
      subscribed: devices > 0,
      devices,
    });
  } catch (error) {
    return unexpectedErrorResponse(res, "push:status", error);
  }
});
