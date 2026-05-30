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
      select: { id: true, type: true, body: true, createdAt: true },
    });
    if (!notification) {
      return res.status(404).json({ message: "Not found" });
    }

    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: trainerUserId },
      select: { id: true },
    });

    const parseCid = (body: string | null | undefined): string | null => {
      if (!body) return null;
      const sep = body.indexOf("||cid:");
      return sep === -1 ? null : body.slice(sep + 6);
    };

    const verifyClient = async (clientProfileId: string): Promise<boolean> => {
      if (!trainerProfile) return false;
      const cp = await prisma.clientProfile.findFirst({
        where: { id: clientProfileId, trainerId: trainerProfile.id },
        select: { id: true },
      });
      return cp !== null;
    };

    let href: string;
    let clientId: string | undefined;

    switch (notification.type) {
      case NotificationType.MESSAGE: {
        // 1. Try embedded marker
        const cidFromBody = parseCid(notification.body);
        if (cidFromBody && (await verifyClient(cidFromBody))) {
          clientId = cidFromBody;
          href = `/admin/messages?clientId=${clientId}`;
          break;
        }

        // 2. Fallback: closest inbound Message within ±10 min
        if (trainerProfile) {
          const windowMs = 10 * 60 * 1000;
          const notifMs = notification.createdAt.getTime();

          const nearby = await prisma.message.findMany({
            where: {
              receiverId: trainerUserId,
              createdAt: {
                gte: new Date(notifMs - windowMs),
                lte: new Date(notifMs + windowMs),
              },
              sender: { clientProfile: { trainerId: trainerProfile.id } },
            },
            select: {
              createdAt: true,
              sender: { select: { clientProfile: { select: { id: true } } } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          });

          if (nearby.length > 0) {
            const closest = nearby.reduce((best, msg) =>
              Math.abs(msg.createdAt.getTime() - notifMs) < Math.abs(best.createdAt.getTime() - notifMs)
                ? msg : best
            );
            const cpId = closest.sender?.clientProfile?.id;
            if (cpId) {
              clientId = cpId;
              href = `/admin/messages?clientId=${clientId}`;
              break;
            }
          }
        }

        href = "/admin/messages";
        break;
      }

      case NotificationType.REQUEST:
        href = "/admin/requests";
        break;

      case NotificationType.WORKOUT:
      case NotificationType.CHECKIN: {
        const cid = parseCid(notification.body);
        if (cid && (await verifyClient(cid))) {
          clientId = cid;
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
        href = "/admin";
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
