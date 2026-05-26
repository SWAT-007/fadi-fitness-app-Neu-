import { Router } from "express";
import { NotificationType } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const meRouter = Router();

meRouter.get("/", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
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
    console.error("[me:client-profile] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:active-plan] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:plan-days] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:workouts:play] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:workout-logs:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:exercise-logs:upsert] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
            body: `${clientProfile.fullName} hat ${workoutLog.day.name} abgeschlossen.`,
          },
        });
        notificationCreated = true;
      } catch (notifError) {
        console.error("[me:workout-logs:complete] notification error:", notifError);
      }
    }

    return res.json({ workoutLog: updatedLog, deletedOrphanCount, notificationCreated });
  } catch (error) {
    console.error("[me:workout-logs:complete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:workout-logs:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
            body: `${clientProfile.fullName} möchte eine Übung wechseln.`,
          },
        });
        notificationCreated = true;
      } catch (notifError) {
        console.error("[me:exercise-change-requests:create] notification error:", notifError);
      }
    }

    return res.status(201).json({ request, notificationCreated });
  } catch (error) {
    console.error("[me:exercise-change-requests:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { meRouter };
