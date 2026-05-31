import { NotificationType } from "@prisma/client";
import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { prisma } from "../db";
import {
  listNotificationsForUser,
  mapNotification,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
  parseNotificationLimit,
} from "./notificationHelpers";

const notificationsRouter = Router();

const CID_MARKER_REGEX = /\|\|cid:([^|:\s]+):?/i;
const CLIENT_ID_QUERY_REGEX = /(?:[?&]clientId=)([^&#\s]+)/i;

const normalizeText = (value: string | null | undefined): string => {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
};

const stripClientMarker = (value: string | null | undefined): string => {
  if (!value) return "";
  return value.replace(/\|\|cid:[^|:\s]+:?/gi, "").trim();
};

const parseClientIdFromText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const fromMarker = value.match(CID_MARKER_REGEX)?.[1];
  if (fromMarker) return fromMarker.trim();

  const fromQuery = value.match(CLIENT_ID_QUERY_REGEX)?.[1];
  if (fromQuery) {
    try {
      return decodeURIComponent(fromQuery).trim();
    } catch {
      return fromQuery.trim();
    }
  }

  return null;
};

const parseClientIdFromUnknown = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsedFromText = parseClientIdFromText(trimmed);
    if (parsedFromText) return parsedFromText;

    // Legacy payloads may be serialized JSON in `body`.
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return parseClientIdFromUnknown(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseClientIdFromUnknown(item);
      if (parsed) return parsed;
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directKeys = [
      "clientId",
      "client_id",
      "entityId",
      "entity_id",
      "relatedId",
      "related_id",
      "href",
      "link",
      "url",
    ];
    for (const key of directKeys) {
      const parsed = parseClientIdFromUnknown(record[key]);
      if (parsed) return parsed;
    }

    const nestedKeys = ["metadata", "meta", "data", "payload", "target"];
    for (const key of nestedKeys) {
      const parsed = parseClientIdFromUnknown(record[key]);
      if (parsed) return parsed;
    }
  }

  return null;
};

const contentSimilarityScore = (notificationBody: string, messageContent: string): number => {
  if (!notificationBody || !messageContent) return 0;
  if (notificationBody === messageContent) return 100_000;
  if (messageContent.includes(notificationBody)) return 60_000;
  if (notificationBody.includes(messageContent)) return 40_000;

  const maxPrefix = Math.min(notificationBody.length, messageContent.length, 40);
  let prefixLen = 0;
  while (prefixLen < maxPrefix && notificationBody[prefixLen] === messageContent[prefixLen]) {
    prefixLen += 1;
  }
  return prefixLen * 600;
};

const pickClosestByTime = <T>(
  items: T[],
  targetDate: Date,
  getTimestamp: (item: T) => number,
): T | null => {
  if (items.length === 0) return null;
  const targetMs = targetDate.getTime();
  return items.reduce((best, current) => (
    Math.abs(getTimestamp(current) - targetMs) < Math.abs(getTimestamp(best) - targetMs)
      ? current
      : best
  ));
};

notificationsRouter.use(requireAuth);

notificationsRouter.use((req: AuthenticatedRequest, res, next) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
});

notificationsRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const notifications = await listNotificationsForUser(
      req.user!.userId,
      parseNotificationLimit(req.query.limit),
    );

    return res.json({ notifications: notifications.map(mapNotification) });
  } catch (error) {
    console.error("[notifications:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

notificationsRouter.get("/:id/target", async (req: AuthenticatedRequest, res) => {
  const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!notificationId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerUserId = req.user!.userId;

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: trainerUserId },
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        body: true,
        createdAt: true,
      },
    });
    if (!notification) {
      return res.status(404).json({ message: "Not found" });
    }

    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: trainerUserId },
      select: { id: true },
    });

    const verifyClient = async (clientProfileId: string): Promise<boolean> => {
      if (!trainerProfile) return false;
      const cp = await prisma.clientProfile.findFirst({
        where: { id: clientProfileId, trainerId: trainerProfile.id },
        select: { id: true },
      });
      return cp !== null;
    };

    const parseClientIdFromNotification = (): string | null => {
      return (
        parseClientIdFromUnknown(notification as unknown as Record<string, unknown>) ??
        parseClientIdFromUnknown(notification.body) ??
        parseClientIdFromUnknown(notification.title)
      );
    };

    const resolveMessageClientId = async (): Promise<string | null> => {
      if (!trainerProfile) return null;

      const parsedClientId = parseClientIdFromNotification();
      if (parsedClientId && (await verifyClient(parsedClientId))) {
        return parsedClientId;
      }

      const notificationBodyText = normalizeText(stripClientMarker(notification.body)).toLowerCase();
      const notifMs = notification.createdAt.getTime();
      const nearWindowMs = 30 * 60 * 1000;

      const nearby = await prisma.message.findMany({
        where: {
          receiverId: trainerUserId,
          createdAt: {
            gte: new Date(notifMs - nearWindowMs),
            lte: new Date(notifMs + nearWindowMs),
          },
          sender: { clientProfile: { trainerId: trainerProfile.id } },
        },
        select: {
          content: true,
          createdAt: true,
          sender: { select: { clientProfile: { select: { id: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      let bestClientId: string | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const message of nearby) {
        const cpId = message.sender?.clientProfile?.id;
        if (!cpId) continue;

        const messageText = normalizeText(message.content).toLowerCase();
        const timeDistanceMs = Math.abs(message.createdAt.getTime() - notifMs);
        const timeScore = -Math.floor(timeDistanceMs / 1000);
        const textScore = contentSimilarityScore(notificationBodyText, messageText);
        const score = timeScore + textScore;

        if (score > bestScore) {
          bestScore = score;
          bestClientId = cpId;
        }
      }

      if (bestClientId && (await verifyClient(bestClientId))) {
        return bestClientId;
      }

      return null;
    };

    const resolveActivityClientId = async (
      type: "WORKOUT" | "CHECKIN",
    ): Promise<string | null> => {
      if (!trainerProfile) return null;

      const parsedClientId = parseClientIdFromNotification();
      if (parsedClientId && (await verifyClient(parsedClientId))) {
        return parsedClientId;
      }

      const notifMs = notification.createdAt.getTime();
      const windowMs = 12 * 60 * 60 * 1000;

      if (type === NotificationType.WORKOUT) {
        const workoutLogs = await prisma.workoutLog.findMany({
          where: {
            completedAt: {
              gte: new Date(notifMs - windowMs),
              lte: new Date(notifMs + windowMs),
            },
            client: { trainerId: trainerProfile.id },
          },
          select: {
            completedAt: true,
            client: { select: { id: true } },
          },
          orderBy: { completedAt: "desc" },
          take: 25,
        });
        const closest = pickClosestByTime(
          workoutLogs,
          notification.createdAt,
          (item) => item.completedAt?.getTime() ?? Number.POSITIVE_INFINITY,
        );
        const closestClientId = closest?.client.id ?? null;
        if (closestClientId && (await verifyClient(closestClientId))) {
          return closestClientId;
        }
        return null;
      }

      const checkins = await prisma.weeklyCheckin.findMany({
        where: {
          createdAt: {
            gte: new Date(notifMs - windowMs),
            lte: new Date(notifMs + windowMs),
          },
          client: { trainerId: trainerProfile.id },
        },
        select: {
          createdAt: true,
          client: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
      const closest = pickClosestByTime(
        checkins,
        notification.createdAt,
        (item) => item.createdAt.getTime(),
      );
      const closestClientId = closest?.client.id ?? null;
      if (closestClientId && (await verifyClient(closestClientId))) {
        return closestClientId;
      }
      return null;
    };

    let href: string;
    let clientId: string | undefined;

    switch (notification.type) {
      case NotificationType.MESSAGE: {
        clientId = await resolveMessageClientId() ?? undefined;
        href = clientId
          ? `/admin/messages?clientId=${encodeURIComponent(clientId)}`
          : "/admin/messages";
        break;
      }

      case NotificationType.REQUEST:
        href = "/admin/requests";
        break;

      case NotificationType.WORKOUT:
      case NotificationType.CHECKIN: {
        const resolvedActivityClientId = await resolveActivityClientId(notification.type);
        if (resolvedActivityClientId) {
          clientId = resolvedActivityClientId;
          href = `/admin/clients/${clientId}`;
        } else {
          href = "/admin/clients";
        }
        break;
      }

      case NotificationType.TRAINING_PLAN:
      case NotificationType.WORKOUT_PLAN:
        href = "/admin/plans";
        break;

      case NotificationType.NUTRITION_PLAN:
        href = "/admin/nutrition";
        break;

      default:
        href = "/admin/dashboard";
        break;
    }

    return res.json({ href, ...(clientId !== undefined ? { clientId } : {}) });
  } catch (error) {
    console.error("[notifications:target] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

notificationsRouter.patch("/:id/read", async (req: AuthenticatedRequest, res) => {
  const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!notificationId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const notification = await markNotificationReadForUser(req.user!.userId, notificationId);
    if (!notification) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({ notification: mapNotification(notification) });
  } catch (error) {
    console.error("[notifications:read] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

notificationsRouter.patch("/read-all", async (req: AuthenticatedRequest, res) => {
  try {
    const result = await markAllNotificationsReadForUser(req.user!.userId);
    return res.json({ updatedCount: result.count });
  } catch (error) {
    console.error("[notifications:read-all] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { notificationsRouter };
