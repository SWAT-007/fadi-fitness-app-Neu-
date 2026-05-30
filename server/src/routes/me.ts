import { Router, type Request, type Response, type NextFunction } from "express";
import { NotificationType } from "@prisma/client";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { unexpectedErrorResponse } from "../utils/errors";
import {
  listNotificationsForUser,
  mapNotification,
  markAllNotificationsReadForUser,
  markNotificationReadForUser,
  parseNotificationLimit,
} from "./notificationHelpers";

const meRouter = Router();

const getCurrentWeekStartKey = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
};

const getCurrentMonthStartKey = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

meRouter.get("/", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

meRouter.get("/trainer-dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            email: true,
            fullName: true,
          },
        },
      },
    });

    if (!trainerProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    const [
      clientCount,
      activeClientCount,
      workoutPlanCount,
      activePlanAssignmentCount,
      nutritionPlanCount,
      pendingRequestCount,
      unreadMessageCount,
      recentClients,
    ] = await Promise.all([
      prisma.clientProfile.count({
        where: { trainerId: trainerProfile.id },
      }),
      prisma.clientProfile.count({
        where: {
          trainerId: trainerProfile.id,
          status: { equals: "active", mode: "insensitive" },
        },
      }),
      prisma.workoutPlan.count({
        where: { trainerId: trainerProfile.id },
      }),
      prisma.assignedPlan.count({
        where: {
          active: true,
          client: { trainerId: trainerProfile.id },
          plan: { trainerId: trainerProfile.id },
        },
      }),
      prisma.nutritionPlan.count({
        where: { trainerId: trainerProfile.id },
      }),
      prisma.exerciseChangeRequest.count({
        where: {
          status: { equals: "pending", mode: "insensitive" },
          client: { trainerId: trainerProfile.id },
        },
      }),
      prisma.message.count({
        where: {
          receiverId: req.user.userId,
          readAt: null,
        },
      }),
      prisma.clientProfile.findMany({
        where: { trainerId: trainerProfile.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          fullName: true,
          email: true,
          createdAt: true,
        },
      }),
    ]);

    return res.json({
      trainer: {
        id: trainerProfile.id,
        userId: trainerProfile.userId,
        email: trainerProfile.user.email ?? "",
        fullName: trainerProfile.user.fullName ?? "",
      },
      stats: {
        clientCount,
        activeClientCount,
        workoutPlanCount,
        activePlanAssignmentCount,
        nutritionPlanCount,
        pendingRequestCount,
        unreadMessageCount,
      },
      recentClients: recentClients.map((client) => ({
        id: client.id,
        fullName: client.fullName,
        email: client.email,
        createdAt: client.createdAt,
      })),
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:trainer-dashboard", error);
  }
});

meRouter.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        trainerId: true,
      },
    });

    if (!clientProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    const weekStart = getCurrentWeekStartKey();
    const monthStart = getCurrentMonthStartKey();

    const [
      assignment,
      completedCount,
      completedThisWeekLogs,
      activeLogs,
      monthlyWorkouts,
      latestProgressLog,
      currentWeekCheckin,
      unreadMessageCount,
    ] = await Promise.all([
      prisma.assignedPlan.findFirst({
        where: { clientId: clientProfile.id, active: true },
        orderBy: { assignedAt: "desc" },
        select: {
          id: true,
          planId: true,
          plan: {
            select: {
              id: true,
              name: true,
              days: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      }),
      prisma.workoutLog.count({
        where: { clientId: clientProfile.id, completedAt: { not: null } },
      }),
      prisma.workoutLog.findMany({
        where: {
          clientId: clientProfile.id,
          completedAt: { not: null },
          date: { gte: weekStart },
        },
        select: { dayId: true },
      }),
      prisma.workoutLog.findMany({
        where: {
          clientId: clientProfile.id,
          completedAt: null,
        },
        select: { dayId: true },
      }),
      prisma.workoutLog.findMany({
        where: {
          clientId: clientProfile.id,
          completedAt: { not: null },
          date: { gte: monthStart },
        },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          durationSeconds: true,
          date: true,
          completedAt: true,
        },
      }),
      prisma.progressLog.findFirst({
        where: { clientId: clientProfile.id },
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          bodyWeight: true,
          notes: true,
        },
      }),
      prisma.weeklyCheckin.findFirst({
        where: {
          clientId: clientProfile.id,
          weekStart,
        },
        select: { id: true },
      }),
      prisma.message.count({
        where: {
          receiverId: req.user.userId,
          readAt: null,
        },
      }),
    ]);

    return res.json({
      client: {
        id: clientProfile.id,
        fullName: clientProfile.fullName,
        email: clientProfile.email,
        trainerId: clientProfile.trainerId,
      },
      activePlan: assignment
        ? {
            id: assignment.id,
            planId: assignment.planId,
            plan: {
              id: assignment.plan.id,
              name: assignment.plan.name,
              days: assignment.plan.days,
            },
          }
        : null,
      workoutStats: {
        completedCount,
        completedThisWeekDayIds: [...new Set(completedThisWeekLogs.map((log) => log.dayId))],
        activeDayIds: [...new Set(activeLogs.map((log) => log.dayId))],
        monthlyWorkouts,
      },
      latestProgressLog,
      hasCurrentWeekCheckin: Boolean(currentWeekCheckin),
      unreadMessageCount,
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:dashboard", error);
  }
});

meRouter.get("/notifications", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const notifications = await listNotificationsForUser(
      req.user!.userId,
      parseNotificationLimit(req.query.limit),
    );

    return res.json({ notifications: notifications.map(mapNotification) });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:notifications:list", error);
  }
});

meRouter.patch("/notifications/:id/read", requireAuth, async (req: AuthenticatedRequest, res) => {
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
        return unexpectedErrorResponse(res, "me:notifications:read", error);
  }
});

meRouter.patch("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await markAllNotificationsReadForUser(req.user!.userId);
    return res.json({ updatedCount: result.count });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:notifications:read-all", error);
  }
});

meRouter.get("/client-profile", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        trainerId: true,
      },
    });

    if (!clientProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({ client: clientProfile });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:client-profile", error);
  }
});

meRouter.get("/active-plan", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    const assignment = await prisma.assignedPlan.findFirst({
      where: { clientId: clientProfile.id, active: true },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        clientId: true,
        planId: true,
        active: true,
        assignedAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
            days: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                planId: true,
                name: true,
                description: true,
                sortOrder: true,
                exercises: {
                  orderBy: { sortOrder: "asc" },
                  select: {
                    id: true,
                    dayId: true,
                    name: true,
                    description: true,
                    sets: true,
                    reps: true,
                    targetWeightKg: true,
                    restSeconds: true,
                    note: true,
                    sortOrder: true,
                    imageUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return res.json({ assignment: null, plan: null });
    }

    return res.json({
      assignment: {
        id: assignment.id,
        clientId: assignment.clientId,
        planId: assignment.planId,
        active: assignment.active,
        assignedAt: assignment.assignedAt,
      },
      plan: {
        ...assignment.plan,
        days: assignment.plan.days.map((day) => ({
          ...day,
          exercises: day.exercises.map((ex) => ({ ...ex, libraryId: null })),
        })),
      },
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:active-plan", error);
  }
});

meRouter.get("/active-workout", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    const activeWorkout = await prisma.workoutLog.findFirst({
      where: {
        clientId: clientProfile.id,
        completedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dayId: true,
        createdAt: true,
        day: {
          select: {
            id: true,
            name: true,
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return res.json({ activeWorkout });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:active-workout", error);
  }
});

meRouter.get("/plan-days/:dayId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayId = Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!clientProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    const assignment = await prisma.assignedPlan.findFirst({
      where: { clientId: clientProfile.id, active: true },
      orderBy: { assignedAt: "desc" },
      select: { planId: true },
    });

    if (!assignment) {
      return res.status(404).json({ message: "Not found" });
    }

    const day = await prisma.workoutDay.findFirst({
      where: { id: dayId, planId: assignment.planId },
      select: {
        id: true,
        planId: true,
        name: true,
        description: true,
        sortOrder: true,
        exercises: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            dayId: true,
            name: true,
            description: true,
            sets: true,
            reps: true,
            targetWeightKg: true,
            restSeconds: true,
            note: true,
            sortOrder: true,
            imageUrl: true,
          },
        },
      },
    });

    if (!day) {
      return res.status(404).json({ message: "Not found" });
    }

    const planDays = await prisma.workoutDay.findMany({
      where: { planId: assignment.planId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true },
    });

    return res.json({
      day: {
        ...day,
        exercises: day.exercises.map((ex) => ({ ...ex, libraryId: null })),
      },
      planDays,
      workoutLog: null,    // WorkoutLog model deferred
      exerciseLogs: [],    // ExerciseLog model deferred
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:plan-days", error);
  }
});

meRouter.get("/workout-logs/week", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  return res.json({
    completedDayIds: [],
    activeDayIds: [],
    activeLogs: [],
  });
});

// ── Workout playback ──────────────────────────────────────────────────────────

meRouter.get("/workouts/:dayId/play", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayId = Array.isArray(req.params.dayId) ? req.params.dayId[0] : req.params.dayId;
  if (!dayId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const assignment = await prisma.assignedPlan.findFirst({
      where: { clientId: clientProfile.id, active: true },
      orderBy: { assignedAt: "desc" },
      select: { planId: true },
    });
    if (!assignment) return res.status(404).json({ message: "Not found" });

    const day = await prisma.workoutDay.findFirst({
      where: { id: dayId, planId: assignment.planId },
      select: {
        id: true,
        planId: true,
        name: true,
        description: true,
        sortOrder: true,
        exercises: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            dayId: true,
            name: true,
            description: true,
            sets: true,
            reps: true,
            targetWeightKg: true,
            restSeconds: true,
            note: true,
            sortOrder: true,
            imageUrl: true,
          },
        },
      },
    });
    if (!day) return res.status(404).json({ message: "Not found" });

    const activeLog = await prisma.workoutLog.findFirst({
      where: { clientId: clientProfile.id, dayId, completedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        clientId: true,
        dayId: true,
        date: true,
        notes: true,
        completedAt: true,
        durationSeconds: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const exerciseLogs = activeLog
      ? await prisma.exerciseLog.findMany({
          where: { workoutLogId: activeLog.id },
          select: {
            id: true,
            workoutLogId: true,
            exerciseId: true,
            actualWeight: true,
            actualReps: true,
            setsDone: true,
            completed: true,
            note: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];

    const exercises = day.exercises.map((ex) => ({ ...ex, libraryId: null }));

    return res.json({
      day: { ...day, exercises },
      exercises,
      workoutLog: activeLog ?? null,
      exerciseLogs,
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:workouts:play", error);
  }
});

meRouter.post("/workout-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { dayId, fresh } = req.body as { dayId?: string; fresh?: boolean };
  if (!dayId) return res.status(400).json({ message: "dayId required" });

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const assignment = await prisma.assignedPlan.findFirst({
      where: { clientId: clientProfile.id, active: true },
      orderBy: { assignedAt: "desc" },
      select: { planId: true },
    });
    if (!assignment) return res.status(404).json({ message: "Not found" });

    const day = await prisma.workoutDay.findFirst({
      where: { id: dayId, planId: assignment.planId },
      select: { id: true },
    });
    if (!day) return res.status(404).json({ message: "Not found" });

    if (!fresh) {
      const existing = await prisma.workoutLog.findFirst({
        where: { clientId: clientProfile.id, dayId, completedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return res.json({ workoutLog: existing, resumed: true });
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const workoutLog = await prisma.workoutLog.create({
      data: { clientId: clientProfile.id, dayId, date: today },
    });

    return res.status(201).json({ workoutLog, resumed: false });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:workout-logs:create", error);
  }
});

meRouter.put("/workout-logs/:logId/exercise-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const logId = Array.isArray(req.params.logId) ? req.params.logId[0] : req.params.logId;
  const { sets } = req.body as { sets?: unknown[] };
  if (!Array.isArray(sets)) {
    return res.status(400).json({ message: "sets must be an array" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const workoutLog = await prisma.workoutLog.findFirst({
      where: { id: logId, clientId: clientProfile.id, completedAt: null },
      select: { id: true, dayId: true },
    });
    if (!workoutLog) return res.status(404).json({ message: "Not found" });

    const validExercises = await prisma.exercise.findMany({
      where: { dayId: workoutLog.dayId },
      select: { id: true },
    });
    const validExerciseIds = new Set(validExercises.map((e) => e.id));

    type SetInput = {
      exerciseId: string;
      setsDone: number | null;
      actualWeight: number | null;
      actualReps: string | null;
      completed: boolean;
      note: string | null;
    };

    const parsedSets: SetInput[] = [];
    for (const item of sets) {
      const s = item as Record<string, unknown>;
      if (typeof s.exerciseId !== "string" || !validExerciseIds.has(s.exerciseId)) {
        return res.status(400).json({ message: "Invalid exerciseId" });
      }
      parsedSets.push({
        exerciseId: s.exerciseId,
        setsDone: typeof s.setsDone === "number" ? Math.trunc(s.setsDone) : null,
        actualWeight: typeof s.actualWeight === "number" ? s.actualWeight : null,
        actualReps: typeof s.actualReps === "string" ? s.actualReps : null,
        completed: s.completed === true,
        note: typeof s.note === "string" ? s.note : null,
      });
    }

    const exerciseLogs = await Promise.all(
      parsedSets.map((s) => {
        if (s.setsDone !== null) {
          return prisma.exerciseLog.upsert({
            where: {
              workoutLogId_exerciseId_setsDone: {
                workoutLogId: logId,
                exerciseId: s.exerciseId,
                setsDone: s.setsDone,
              },
            },
            update: {
              actualWeight: s.actualWeight,
              actualReps: s.actualReps,
              completed: s.completed,
              note: s.note,
            },
            create: {
              workoutLogId: logId,
              exerciseId: s.exerciseId,
              setsDone: s.setsDone,
              actualWeight: s.actualWeight,
              actualReps: s.actualReps,
              completed: s.completed,
              note: s.note,
            },
          });
        }
        // setsDone is null — always create (NULL != NULL in unique index)
        return prisma.exerciseLog.create({
          data: {
            workoutLogId: logId,
            exerciseId: s.exerciseId,
            setsDone: null,
            actualWeight: s.actualWeight,
            actualReps: s.actualReps,
            completed: s.completed,
            note: s.note,
          },
        });
      }),
    );

    return res.json({ exerciseLogs });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:exercise-logs:upsert", error);
  }
});

meRouter.patch("/workout-logs/:logId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const logId = Array.isArray(req.params.logId) ? req.params.logId[0] : req.params.logId;
  const { completedAt, durationSeconds } = req.body as {
    completedAt?: string;
    durationSeconds?: number;
  };

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: {
        id: true,
        fullName: true,
        trainer: { select: { userId: true } },
      },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const workoutLog = await prisma.workoutLog.findFirst({
      where: { id: logId, clientId: clientProfile.id, completedAt: null },
      include: { day: { select: { name: true } } },
    });
    if (!workoutLog) return res.status(404).json({ message: "Not found" });

    const resolvedCompletedAt = completedAt ? new Date(completedAt) : new Date();
    const resolvedDurationSeconds = typeof durationSeconds === "number" ? durationSeconds : null;

    const { updatedLog, deletedOrphanCount } = await prisma.$transaction(async (tx) => {
      const log = await tx.workoutLog.update({
        where: { id: logId },
        data: { completedAt: resolvedCompletedAt, durationSeconds: resolvedDurationSeconds },
      });
      const { count } = await tx.workoutLog.deleteMany({
        where: {
          clientId: clientProfile.id,
          dayId: workoutLog.dayId,
          completedAt: null,
          id: { not: logId },
        },
      });
      return { updatedLog: log, deletedOrphanCount: count };
    });

    let notificationCreated = false;
    if (clientProfile.trainer?.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: clientProfile.trainer.userId,
            type: NotificationType.WORKOUT,
            title: "Workout abgeschlossen",
            body: `${clientProfile.fullName} hat ${workoutLog.day.name} abgeschlossen.||cid:${clientProfile.id}`,
          },
        });
        notificationCreated = true;
      } catch (notifError) {
        console.error("[me:workout-logs:complete] notification error:", notifError);
      }
    }

    return res.json({ workoutLog: updatedLog, deletedOrphanCount, notificationCreated });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:workout-logs:complete", error);
  }
});

meRouter.delete("/workout-logs/:logId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const logId = Array.isArray(req.params.logId) ? req.params.logId[0] : req.params.logId;

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const workoutLog = await prisma.workoutLog.findFirst({
      where: { id: logId, clientId: clientProfile.id },
      select: { id: true, completedAt: true },
    });
    if (!workoutLog) return res.status(404).json({ message: "Not found" });

    if (workoutLog.completedAt !== null) {
      return res.status(400).json({ message: "Cannot delete a completed workout log" });
    }

    await prisma.workoutLog.delete({ where: { id: logId } });

    return res.json({ deleted: true, workoutLogId: logId });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:workout-logs:delete", error);
  }
});

meRouter.post("/exercise-change-requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { dayId, exerciseId, reason } = req.body as {
    dayId?: string;
    exerciseId?: string;
    reason?: string;
  };
  if (!dayId || !exerciseId || !reason?.trim()) {
    return res.status(400).json({ message: "dayId, exerciseId, and reason are required" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: {
        id: true,
        fullName: true,
        trainer: { select: { userId: true } },
      },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const assignment = await prisma.assignedPlan.findFirst({
      where: { clientId: clientProfile.id, active: true },
      orderBy: { assignedAt: "desc" },
      select: { planId: true },
    });
    if (!assignment) return res.status(404).json({ message: "Not found" });

    const day = await prisma.workoutDay.findFirst({
      where: { id: dayId, planId: assignment.planId },
      select: { id: true },
    });
    if (!day) return res.status(404).json({ message: "Not found" });

    const exercise = await prisma.exercise.findFirst({
      where: { id: exerciseId, dayId },
      select: { id: true },
    });
    if (!exercise) return res.status(404).json({ message: "Not found" });

    // Return existing pending request if one already exists for the same exercise+day
    const pendingDuplicate = await prisma.exerciseChangeRequest.findFirst({
      where: {
        clientId: clientProfile.id,
        dayId,
        exerciseId,
        status: { equals: "pending", mode: "insensitive" as const },
      },
      select: { id: true, clientId: true, dayId: true, exerciseId: true, reason: true, status: true, createdAt: true },
    });
    if (pendingDuplicate) {
      return res.json({ request: pendingDuplicate, notificationCreated: false });
    }

    const request = await prisma.exerciseChangeRequest.create({
      data: {
        clientId: clientProfile.id,
        dayId,
        exerciseId,
        reason: reason.trim(),
      },
    });

    let notificationCreated = false;
    if (clientProfile.trainer?.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: clientProfile.trainer.userId,
            type: NotificationType.REQUEST,
            title: "Übungswechsel angefragt",
            body: `${clientProfile.fullName} möchte eine Übung wechseln.||cid:${clientProfile.id}`,
          },
        });
        notificationCreated = true;
      } catch (notifError) {
        console.error("[me:exercise-change-requests:create] notification error:", notifError);
      }
    }

    return res.status(201).json({ request, notificationCreated });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:exercise-change-requests:create", error);
  }
});

const cmfSelect = {
  id: true,
  clientId: true,
  mealId: true,
  foodId: true,
  category: true,
  amountG: true,
  createdAt: true,
  updatedAt: true,
  food: {
    select: {
      id: true,
      name: true,
      caloriesPer100g: true,
      proteinPer100g: true,
      carbsPer100g: true,
      fatPer100g: true,
      unit: true,
    },
  },
} as const;

const drinkLogSelect = {
  id: true,
  clientId: true,
  drinkType: true,
  amountMl: true,
  loggedAt: true,
} as const;

const mealHistorySelect = {
  id: true,
  clientId: true,
  name: true,
  category: true,
  amountG: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true,
  loggedAt: true,
} as const;

meRouter.get("/nutrition", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true, fullName: true, trainerId: true },
    });
    if (!clientProfile) {
      return res.status(404).json({ message: "Not found" });
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [activeNutritionPlan, foods, clientMealFoods, mealHistory, drinkLogs] = await Promise.all([
      prisma.assignedNutritionPlan.findFirst({
        where: { clientId: clientProfile.id, active: true },
        orderBy: { assignedAt: "desc" },
        select: {
          id: true,
          clientId: true,
          planId: true,
          active: true,
          assignedAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              description: true,
              meals: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  planId: true,
                  name: true,
                  description: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      }),
      prisma.food.findMany({
        where: {
          OR: [
            { trainerId: clientProfile.trainerId },
            { trainerId: null },
          ],
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          caloriesPer100g: true,
          proteinPer100g: true,
          carbsPer100g: true,
          fatPer100g: true,
          unit: true,
        },
      }),
      prisma.clientMealFood.findMany({
        where: {
          clientId: clientProfile.id,
          createdAt: { gte: todayStart },
        },
        orderBy: { createdAt: "asc" },
        select: cmfSelect,
      }),
      prisma.mealHistory.findMany({
        where: { clientId: clientProfile.id },
        orderBy: { loggedAt: "desc" },
        take: 50,
        select: mealHistorySelect,
      }),
      prisma.drinkLog.findMany({
        where: {
          clientId: clientProfile.id,
          loggedAt: { gte: todayStart },
        },
        orderBy: { loggedAt: "desc" },
        take: 100,
        select: drinkLogSelect,
      }),
    ]);

    return res.json({
      client: {
        id: clientProfile.id,
        fullName: clientProfile.fullName,
        trainerId: clientProfile.trainerId,
      },
      activeNutritionPlan: activeNutritionPlan ?? null,
      foods,
      clientMealFoods,
      mealHistory,
      drinkLogs,
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition", error);
  }
});

meRouter.post("/nutrition/client-meal-foods", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const { mealId, foodId, category, amountG } = req.body as {
    mealId?: string;
    foodId?: string;
    category?: string;
    amountG?: number;
  };
  if (!foodId) {
    return res.status(400).json({ message: "foodId required" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true, trainerId: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    // Validate food ownership: must be trainer's food or global
    const food = await prisma.food.findFirst({
      where: {
        id: foodId,
        OR: [{ trainerId: clientProfile.trainerId }, { trainerId: null }],
      },
      select: { id: true },
    });
    if (!food) return res.status(400).json({ message: "Food not found or not accessible" });

    // Validate meal ownership: must belong to client's active nutrition plan
    if (mealId) {
      const activeAssignment = await prisma.assignedNutritionPlan.findFirst({
        where: { clientId: clientProfile.id, active: true },
        orderBy: { assignedAt: "desc" },
        select: { planId: true },
      });
      if (!activeAssignment) return res.status(400).json({ message: "No active nutrition plan" });

      const meal = await prisma.nutritionMeal.findFirst({
        where: { id: mealId, planId: activeAssignment.planId },
        select: { id: true },
      });
      if (!meal) return res.status(400).json({ message: "Meal not found in active plan" });
    }

    const cmf = await prisma.clientMealFood.create({
      data: {
        clientId: clientProfile.id,
        mealId: mealId ?? null,
        foodId,
        category: category ?? null,
        amountG: typeof amountG === "number" ? amountG : null,
      },
      select: cmfSelect,
    });

    return res.status(201).json({ clientMealFood: cmf });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:cmf:create", error);
  }
});

meRouter.patch("/nutrition/client-meal-foods/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const cmfId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!cmfId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true, trainerId: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const existing = await prisma.clientMealFood.findFirst({
      where: { id: cmfId, clientId: clientProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    const body = (req.body as Record<string, unknown>) ?? {};

    // Validate food ownership if foodId is being changed
    if (Object.prototype.hasOwnProperty.call(body, "foodId") && body.foodId != null) {
      const food = await prisma.food.findFirst({
        where: {
          id: body.foodId as string,
          OR: [{ trainerId: clientProfile.trainerId }, { trainerId: null }],
        },
        select: { id: true },
      });
      if (!food) return res.status(400).json({ message: "Food not found or not accessible" });
    }

    // Validate meal ownership if mealId is being changed
    if (Object.prototype.hasOwnProperty.call(body, "mealId") && body.mealId != null) {
      const activeAssignment = await prisma.assignedNutritionPlan.findFirst({
        where: { clientId: clientProfile.id, active: true },
        orderBy: { assignedAt: "desc" },
        select: { planId: true },
      });
      if (!activeAssignment) return res.status(400).json({ message: "No active nutrition plan" });

      const meal = await prisma.nutritionMeal.findFirst({
        where: { id: body.mealId as string, planId: activeAssignment.planId },
        select: { id: true },
      });
      if (!meal) return res.status(400).json({ message: "Meal not found in active plan" });
    }

    const data: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, "mealId")) data.mealId = body.mealId ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "foodId")) data.foodId = body.foodId ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "category")) data.category = body.category ?? null;
    if (Object.prototype.hasOwnProperty.call(body, "amountG")) data.amountG = typeof body.amountG === "number" ? body.amountG : null;

    const cmf = await prisma.clientMealFood.update({
      where: { id: cmfId },
      data,
      select: cmfSelect,
    });

    return res.json({ clientMealFood: cmf });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:cmf:update", error);
  }
});

meRouter.delete("/nutrition/client-meal-foods/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const cmfId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!cmfId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const existing = await prisma.clientMealFood.findFirst({
      where: { id: cmfId, clientId: clientProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    await prisma.clientMealFood.delete({ where: { id: cmfId } });

    return res.json({ deleted: true, id: cmfId });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:cmf:delete", error);
  }
});

meRouter.get("/nutrition/drink-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rawLimit = parseInt(String(req.query.limit ?? "100"), 10);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 300) : 100;

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const logs = await prisma.drinkLog.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { loggedAt: "desc" },
      take,
      select: drinkLogSelect,
    });

    return res.json({ drinkLogs: logs });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:drink-logs:list", error);
  }
});

meRouter.post("/nutrition/drink-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const drinkType = typeof body.drinkType === "string" ? body.drinkType.trim() : null;
  const rawAmount = body.amountMl;
  if (rawAmount !== undefined && rawAmount !== null && typeof rawAmount !== "number") {
    return res.status(400).json({ message: "amountMl must be a number or null" });
  }
  const amountMl = typeof rawAmount === "number" ? (rawAmount >= 0 ? rawAmount : null) : null;

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const log = await prisma.drinkLog.create({
      data: {
        clientId: clientProfile.id,
        drinkType,
        amountMl,
      },
      select: drinkLogSelect,
    });

    return res.status(201).json({ drinkLog: log });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:drink-logs:create", error);
  }
});

meRouter.delete("/nutrition/drink-logs/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const logId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!logId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const existing = await prisma.drinkLog.findFirst({
      where: { id: logId, clientId: clientProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    await prisma.drinkLog.delete({ where: { id: logId } });

    return res.json({ deleted: true, id: logId });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:drink-logs:delete", error);
  }
});

meRouter.get("/nutrition/meal-history", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const history = await prisma.mealHistory.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { loggedAt: "desc" },
      take,
      select: mealHistorySelect,
    });

    return res.json({ mealHistory: history });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:meal-history:list", error);
  }
});

meRouter.post("/nutrition/meal-history", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const name     = typeof body.name     === "string" ? body.name.trim()  : null;
  const category = typeof body.category === "string" ? body.category.trim() : null;
  const amountG  = typeof body.amountG  === "number" ? body.amountG  : null;
  const calories = typeof body.calories === "number" ? body.calories : null;
  const protein  = typeof body.protein  === "number" ? body.protein  : null;
  const carbs    = typeof body.carbs    === "number" ? body.carbs    : null;
  const fat      = typeof body.fat      === "number" ? body.fat      : null;

  if (!name && !category && calories == null && protein == null) {
    return res.status(400).json({ message: "At least name, category, or macros required" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const item = await prisma.mealHistory.create({
      data: {
        clientId: clientProfile.id,
        name,
        category,
        amountG,
        calories,
        protein,
        carbs,
        fat,
      },
      select: mealHistorySelect,
    });

    return res.status(201).json({ mealHistoryItem: item });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:meal-history:create", error);
  }
});

meRouter.delete("/nutrition/meal-history/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const itemId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!itemId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findFirst({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const existing = await prisma.mealHistory.findFirst({
      where: { id: itemId, clientId: clientProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    await prisma.mealHistory.delete({ where: { id: itemId } });

    return res.json({ deleted: true, id: itemId });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:meal-history:delete", error);
  }
});

// ─── MealLogs ─────────────────────────────────────────────────────────────────

const mealLogSelect = {
  id: true,
  clientId: true,
  date: true,
  mealType: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

meRouter.get("/nutrition/meal-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(300, Math.max(1, limitRaw)) : 100;
  const date = typeof req.query.date === "string" ? req.query.date.trim() || null : null;

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const mealLogs = await prisma.mealLog.findMany({
      where: {
        clientId: clientProfile.id,
        ...(date ? { date } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: mealLogSelect,
    });

    return res.json({ mealLogs });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:meal-logs:list", error);
  }
});

meRouter.post("/nutrition/meal-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateInput = req.body?.date;
  const date =
    dateInput && typeof dateInput === "string" && dateInput.trim()
      ? dateInput.trim()
      : today;
  const mealType =
    typeof req.body?.mealType === "string" ? req.body.mealType.trim() || null : null;
  const notes =
    typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null;

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const mealLog = await prisma.mealLog.create({
      data: { clientId: clientProfile.id, date, mealType, notes },
      select: mealLogSelect,
    });

    return res.status(201).json({ mealLog });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:meal-logs:create", error);
  }
});

meRouter.delete("/nutrition/meal-logs/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const itemId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!itemId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const existing = await prisma.mealLog.findFirst({
      where: { id: itemId, clientId: clientProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    await prisma.mealLog.delete({ where: { id: existing.id } });

    return res.json({ deleted: true, id: itemId });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:nutrition:meal-logs:delete", error);
  }
});

const weeklyCheckinSelect = {
  id: true,
  clientId: true,
  weekStart: true,
  mood: true,
  energy: true,
  sleepQuality: true,
  hunger: true,
  stress: true,
  bodyWeight: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  images: {
    select: {
      id: true,
      checkinId: true,
      storagePath: true,
      createdAt: true,
    },
  },
} as const;

meRouter.get("/checkins", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const checkins = await prisma.weeklyCheckin.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { weekStart: "desc" },
      take: limit,
      select: weeklyCheckinSelect,
    });

    return res.json({ checkins });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:checkins:list", error);
  }
});

meRouter.post("/checkins", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const weekStartInput = req.body?.weekStart;
  if (!weekStartInput || typeof weekStartInput !== "string" || !weekStartInput.trim()) {
    return res.status(400).json({ message: "weekStart is required" });
  }
  const weekStart = weekStartInput.trim();

  const parseRating = (val: unknown): number | null => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    if (i < 1 || i > 5) return null;
    return i;
  };

  const mood = parseRating(req.body?.mood);
  const energy = parseRating(req.body?.energy);
  const sleepQuality = parseRating(req.body?.sleepQuality);
  const hunger = parseRating(req.body?.hunger);
  const stress = parseRating(req.body?.stress);

  const rawWeight = req.body?.bodyWeight;
  let bodyWeight: number | null = null;
  if (rawWeight !== null && rawWeight !== undefined) {
    const n = Number(rawWeight);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ message: "Invalid bodyWeight" });
    }
    bodyWeight = n;
  }

  const comment =
    typeof req.body?.comment === "string" ? req.body.comment.trim() || null : null;

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: {
        id: true,
        fullName: true,
        trainer: { select: { userId: true } },
      },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const checkin = await prisma.weeklyCheckin.upsert({
      where: { clientId_weekStart: { clientId: clientProfile.id, weekStart } },
      create: { clientId: clientProfile.id, weekStart, mood, energy, sleepQuality, hunger, stress, bodyWeight, comment },
      update: { mood, energy, sleepQuality, hunger, stress, bodyWeight, comment },
      select: weeklyCheckinSelect,
    });

    let notificationCreated = false;
    if (clientProfile.trainer?.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: clientProfile.trainer.userId,
            type: NotificationType.CHECKIN,
            title: "Check-in eingereicht",
            body: `${clientProfile.fullName} hat einen Check-in eingereicht.||cid:${clientProfile.id}`,
          },
        });
        notificationCreated = true;
      } catch (notifError) {
        console.error("[me:checkins:upsert] notification error:", notifError);
      }
    }

    return res.status(201).json({ checkin, notificationCreated });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:checkins:upsert", error);
  }
});

const progressLogSelect = {
  id: true,
  clientId: true,
  date: true,
  bodyWeight: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

meRouter.get("/progress-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rawLimit = parseInt(String(req.query.limit ?? "30"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 30 : Math.min(rawLimit, 200);

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const progressLogs = await prisma.progressLog.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { date: "desc" },
      take: limit,
      select: progressLogSelect,
    });

    return res.json({ progressLogs });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:progress-logs:list", error);
  }
});

meRouter.post("/progress-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateInput = req.body?.date;
  const date =
    dateInput && typeof dateInput === "string" && dateInput.trim()
      ? dateInput.trim()
      : today;

  const rawWeight = req.body?.bodyWeight;
  let bodyWeight: number | null = null;
  if (rawWeight !== null && rawWeight !== undefined) {
    const n = Number(rawWeight);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ message: "Invalid bodyWeight" });
    }
    bodyWeight = n;
  }

  const notes =
    typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null;

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const progressLog = await prisma.progressLog.create({
      data: { clientId: clientProfile.id, date, bodyWeight, notes },
      select: progressLogSelect,
    });

    return res.status(201).json({ progressLog });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:progress-logs:create", error);
  }
});

meRouter.delete("/progress-logs/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const itemId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!itemId) return res.status(404).json({ message: "Not found" });

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const existing = await prisma.progressLog.findFirst({
      where: { id: itemId, clientId: clientProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    await prisma.progressLog.delete({ where: { id: existing.id } });

    return res.json({ deleted: true, id: itemId });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:progress-logs:delete", error);
  }
});

const messageSelect = {
  id: true,
  senderId: true,
  receiverId: true,
  content: true,
  createdAt: true,
  readAt: true,
  sender: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
};

meRouter.get("/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rawLimit = parseInt(String(req.query.limit ?? "100"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 100 : Math.min(rawLimit, 300);

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: {
        id: true,
        userId: true,
        fullName: true,
        email: true,
        trainer: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const trainerUserId = clientProfile.trainer?.userId ?? null;
    const trainerUser = clientProfile.trainer?.user ?? null;

    if (!clientProfile.userId || !trainerUserId) {
      return res.json({
        client: {
          id: clientProfile.id,
          userId: clientProfile.userId,
          fullName: clientProfile.fullName,
          email: clientProfile.email,
        },
        trainer: null,
        messages: [],
      });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: clientProfile.userId, receiverId: trainerUserId },
          { senderId: trainerUserId, receiverId: clientProfile.userId },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: messageSelect,
    });

    return res.json({
      client: {
        id: clientProfile.id,
        userId: clientProfile.userId,
        fullName: clientProfile.fullName,
        email: clientProfile.email,
      },
      trainer: trainerUser
        ? {
            id: trainerUser.id,
            fullName: trainerUser.fullName,
            email: trainerUser.email,
          }
        : {
            id: trainerUserId,
            fullName: null,
            email: null,
          },
      messages,
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:messages:list", error);
  }
});

meRouter.post("/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    return res.status(400).json({ message: "Content required" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: {
        id: true,
        fullName: true,
        trainer: { select: { userId: true } },
      },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });
    if (!clientProfile.trainer?.userId) {
      return res.status(404).json({ message: "Trainer not found" });
    }

    const message = await prisma.message.create({
      data: {
        senderId: req.user.userId,
        receiverId: clientProfile.trainer.userId,
        content,
      },
      select: messageSelect,
    });

    let notificationCreated = false;
    try {
      const shortBody = content.length > 80 ? `${content.slice(0, 77)}...` : content;
      await prisma.notification.create({
        data: {
          userId: clientProfile.trainer.userId,
          type: NotificationType.MESSAGE,
          title: "Neue Nachricht von deinem Client",
          body: `${shortBody}||cid:${clientProfile.id}`,
        },
      });
      notificationCreated = true;
    } catch (notifError) {
      console.error("[me:messages:create] notification error:", notifError);
    }

    return res.status(201).json({ message, notificationCreated });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:messages:create", error);
  }
});

meRouter.post("/messages/read", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: {
        trainer: { select: { userId: true } },
      },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });
    if (!clientProfile.trainer?.userId) {
      return res.json({ updatedCount: 0 });
    }

    const result = await prisma.message.updateMany({
      where: {
        senderId: clientProfile.trainer.userId,
        receiverId: req.user.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return res.json({ updatedCount: result.count });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:messages:read", error);
  }
});

meRouter.get("/progress-summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "client") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rawLimit = parseInt(String(req.query.limit ?? "60"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 60 : Math.min(rawLimit, 100);

  try {
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true, fullName: true, trainerId: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const [completedWorkoutCount, recentWorkouts] = await Promise.all([
      prisma.workoutLog.count({
        where: { clientId: clientProfile.id, completedAt: { not: null } },
      }),
      prisma.workoutLog.findMany({
        where: { clientId: clientProfile.id, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: limit,
        select: {
          id: true,
          dayId: true,
          date: true,
          durationSeconds: true,
          completedAt: true,
          createdAt: true,
          day: {
            select: {
              id: true,
              name: true,
              plan: { select: { id: true, name: true } },
            },
          },
          exerciseLogs: {
            select: {
              actualWeight: true,
              actualReps: true,
              setsDone: true,
              completed: true,
              exercise: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return res.json({
      client: {
        id: clientProfile.id,
        fullName: clientProfile.fullName,
        trainerId: clientProfile.trainerId,
      },
      workoutSummary: {
        completedWorkoutCount,
        recentWorkouts,
      },
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "me:progress-summary", error);
  }
});

// ─── Check-in image upload ────────────────────────────────────────────────────

const CHECKIN_UPLOADS_DIR = path.join(process.cwd(), "uploads", "checkins");
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const checkinImageStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const checkinId = (req as unknown as { params: Record<string, string> }).params?.checkinId ?? "unknown";
    const dir = path.join(CHECKIN_UPLOADS_DIR, checkinId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const checkinUpload = multer({
  storage: checkinImageStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_IMAGE_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Ungültiger Dateityp"));
  },
});

const checkinUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  checkinUpload.array("images", 5)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload-Fehler: ${err.message}` });
    }
    if (err instanceof Error) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

meRouter.post(
  "/checkins/:checkinId/images",
  requireAuth,
  checkinUploadMiddleware,
  async (req: AuthenticatedRequest, res) => {
    if (req.user?.role !== "client") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const checkinId = String(req.params.checkinId ?? '');
    const files = req.files as Express.Multer.File[] | undefined;

    if (!checkinId) {
      return res.status(400).json({ message: "Invalid checkinId" });
    }
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Keine Dateien hochgeladen" });
    }

    const cleanup = () => {
      for (const f of files) {
        try { fs.unlinkSync(f.path); } catch { /* ignore */ }
      }
    };

    try {
      const clientProfile = await prisma.clientProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      if (!clientProfile) { cleanup(); return res.status(404).json({ message: "Not found" }); }

      const checkin = await prisma.weeklyCheckin.findFirst({
        where: { id: checkinId, clientId: clientProfile.id },
        select: { id: true },
      });
      if (!checkin) { cleanup(); return res.status(404).json({ message: "Check-in nicht gefunden" }); }

      const images = await Promise.all(
        files.map(f => {
          const storagePath = `/uploads/checkins/${checkinId}/${f.filename}`;
          return prisma.checkinImage.create({
            data: { checkinId: checkin.id, storagePath },
            select: { id: true, checkinId: true, storagePath: true, createdAt: true },
          });
        })
      );

      return res.status(201).json({ images });
    } catch (error) {
      cleanup();
      return unexpectedErrorResponse(res, "me:checkins:images:create", error);
    }
  }
);

export { meRouter };
