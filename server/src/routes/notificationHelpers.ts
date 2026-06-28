import { NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "../db";
import { sendPushToUser, type PushPayload } from "../utils/pushDispatcher";

// Generic, privacy-safe push texts. Keyed by scenario (not NotificationType),
// because NotificationType.WORKOUT is reused for two different situations
// (plan updated for a client vs. workout completed by a client). No sensitive
// message content ever goes into a push body.
export const PUSH_TEXTS = {
  newMessage: { title: "Neue Nachricht", body: "Du hast eine neue Nachricht in MilaCoach." },
  trainingPlan: { title: "Trainingsplan aktualisiert", body: "Dein Trainingsplan wurde aktualisiert." },
  nutritionPlan: { title: "Ernährungsplan aktualisiert", body: "Dein Ernährungsplan wurde aktualisiert." },
  request: { title: "Neue Anfrage", body: "Es gibt eine neue Anfrage in MilaCoach." },
  workoutCompleted: { title: "Workout abgeschlossen", body: "Ein Kunde hat ein Workout abgeschlossen." },
  checkin: { title: "Neuer Check-in", body: "Ein Kunde hat einen Check-in gesendet." },
} as const;

// Fire-and-forget push wrapper. Never throws — safe to `void` from any route so
// a push failure can never break the API response or the in-app notification.
export const pushNotify = (
  userId: string,
  text: { title: string; body: string },
  url: string,
  type: string,
): void => {
  void sendPushToUser(userId, { ...text, url, type } satisfies PushPayload);
};

export const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  link: true,
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
  link: notification.link,
  is_read: notification.isRead,
  created_at: notification.createdAt.toISOString(),
});

// Builds the client deep-link for a resolved change-request. Falls back to the
// day view (without ?ex) when the target exercise no longer exists.
export const buildExerciseChangeLink = (dayId: string, exerciseId: string | null) =>
  exerciseId
    ? `/client/plan/${dayId}?ex=${exerciseId}`
    : `/client/plan/${dayId}`;

// Creates the "request accepted" client notification (with optional deep link).
// Works with both the global client and a transaction client.
export const createRequestAcceptedNotification = (
  db: Prisma.TransactionClient,
  args: { userId: string; exerciseName: string | null; link: string | null },
) =>
  db.notification.create({
    data: {
      userId: args.userId,
      type: NotificationType.REQUEST,
      title: "Deine Anfrage wurde akzeptiert",
      body: args.exerciseName,
      link: args.link,
    },
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
