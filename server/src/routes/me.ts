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
    console.error("[me:nutrition] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:cmf:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:cmf:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:cmf:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:drink-logs:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:drink-logs:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:drink-logs:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:meal-history:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:meal-history:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:meal-history:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:meal-logs:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:meal-logs:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:nutrition:meal-logs:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:checkins:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
            body: `${clientProfile.fullName} hat einen Check-in eingereicht.`,
          },
        });
        notificationCreated = true;
      } catch (notifError) {
        console.error("[me:checkins:upsert] notification error:", notifError);
      }
    }

    return res.status(201).json({ checkin, notificationCreated });
  } catch (error) {
    console.error("[me:checkins:upsert] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:progress-logs:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:progress-logs:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:progress-logs:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
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
    console.error("[me:progress-summary] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { meRouter };

