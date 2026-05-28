import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
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
