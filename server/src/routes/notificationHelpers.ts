import { NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "../db";

export const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  isRead: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type NotificationRecord = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

const normalizeNotificationType = (type: NotificationType) =>
  type.toLowerCase() as Lowercase<NotificationType>;

export const mapNotification = (notification: NotificationRecord) => ({
  id: notification.id,
  user_id: notification.userId,
  type: normalizeNotificationType(notification.type),
  title: notification.title,
  body: notification.body,
  is_read: notification.isRead,
  created_at: notification.createdAt.toISOString(),
});

export const parseNotificationLimit = (value: unknown) => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(typeof rawValue === "string" ? rawValue : "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }

  return Math.min(parsed, 100);
};

export const listNotificationsForUser = async (userId: string, limit: number) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: notificationSelect,
  });
};

export const findNotificationForUser = async (userId: string, notificationId: string) => {
  return prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
    select: notificationSelect,
  });
};

export const markNotificationReadForUser = async (
  userId: string,
  notificationId: string,
) => {
  const existing = await findNotificationForUser(userId, notificationId);
  if (!existing) {
    return null;
  }

  if (existing.isRead) {
    return existing;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
    select: notificationSelect,
  });
};

export const markAllNotificationsReadForUser = async (userId: string) => {
  return prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};
