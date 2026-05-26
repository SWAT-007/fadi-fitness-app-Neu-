import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const plansRouter = Router();
const workoutDaysRouter = Router();
const exercisesRouter = Router();

const mapPlan = (plan: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    days: number;
    assignedPlans: number;
  };
}) => ({
  id: plan.id,
  name: plan.name,
  title: plan.name,
  description: plan.description,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
  dayCount: plan._count.days,
  assignmentCount: plan._count.assignedPlans,
});

plansRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const planDescription =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;
  const daysInput = Array.isArray(req.body?.days) ? req.body.days : [];

  if (!planName) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const normalizedDays: Array<{
    name: string;
    description: string | null;
    exercises: Array<{
      name: string;
      description: string | null;
      sets: number;
      reps: string;
      targetWeightKg: number | null;
      restSeconds: number | null;
      note: string | null;
      imageUrl: string | null;
    }>;
  }> = [];

  for (const dayItem of daysInput) {
    const dayName = typeof dayItem?.name === "string" ? dayItem.name.trim() : "";
    if (!dayName) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const dayDescriptionInput = dayItem?.description;
    const dayDescription =
      dayDescriptionInput === null
        ? null
        : typeof dayDescriptionInput === "string"
          ? dayDescriptionInput
          : null;
    const exercisesInput = Array.isArray(dayItem?.exercises) ? dayItem.exercises : [];
    const normalizedExercises: Array<{
      name: string;
      description: string | null;
      sets: number;
      reps: string;
      targetWeightKg: number | null;
      restSeconds: number | null;
      note: string | null;
      imageUrl: string | null;
    }> = [];

    for (const exerciseItem of exercisesInput) {
      const exerciseName = typeof exerciseItem?.name === "string" ? exerciseItem.name.trim() : "";
      if (!exerciseName) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const exerciseDescriptionInput = exerciseItem?.description;
      const exerciseDescription =
        exerciseDescriptionInput === null
          ? null
          : typeof exerciseDescriptionInput === "string"
            ? exerciseDescriptionInput
            : null;
      const setsInput = exerciseItem?.sets;
      const sets =
        typeof setsInput === "number" && Number.isInteger(setsInput) && setsInput > 0
          ? setsInput
          : 3;
      const repsInput = exerciseItem?.reps;
      const reps = typeof repsInput === "string" && repsInput.trim() ? repsInput.trim() : "10";
      const targetWeightKgInput = exerciseItem?.targetWeightKg;
      const targetWeightKg =
        targetWeightKgInput === null
          ? null
          : typeof targetWeightKgInput === "number" && Number.isFinite(targetWeightKgInput)
            ? targetWeightKgInput
            : null;
      const restSecondsInput = exerciseItem?.restSeconds;
      const restSeconds =
        restSecondsInput === null
          ? null
          : typeof restSecondsInput === "number" && Number.isFinite(restSecondsInput)
            ? restSecondsInput
            : null;
      const noteInput = exerciseItem?.note;
      const note = noteInput === null ? null : typeof noteInput === "string" ? noteInput : null;
      const imageUrlInput = exerciseItem?.imageUrl;
      const imageUrl = imageUrlInput === null ? null : typeof imageUrlInput === "string" ? imageUrlInput : null;

      normalizedExercises.push({
        name: exerciseName,
        description: exerciseDescription,
        sets,
        reps,
        targetWeightKg,
        restSeconds,
        note,
        imageUrl,
      });
    }

    normalizedDays.push({
      name: dayName,
      description: dayDescription,
      exercises: normalizedExercises,
    });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdPlan = await tx.workoutPlan.create({
        data: {
          trainerId: trainerProfile.id,
          name: planName,
          description: planDescription,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      let exerciseCount = 0;

      for (let dayIndex = 0; dayIndex < normalizedDays.length; dayIndex += 1) {
        const day = normalizedDays[dayIndex];
        const createdDay = await tx.workoutDay.create({
          data: {
            planId: createdPlan.id,
            name: day.name,
            description: day.description,
            sortOrder: dayIndex,
          },
          select: { id: true },
        });

        for (let exerciseIndex = 0; exerciseIndex < day.exercises.length; exerciseIndex += 1) {
          const exercise = day.exercises[exerciseIndex];
          await tx.exercise.create({
            data: {
              dayId: createdDay.id,
              name: exercise.name,
              description: exercise.description,
              sets: exercise.sets,
              reps: exercise.reps,
              targetWeightKg: exercise.targetWeightKg,
              restSeconds: exercise.restSeconds,
              note: exercise.note,
              sortOrder: exerciseIndex,
              imageUrl: exercise.imageUrl,
            },
          });
          exerciseCount += 1;
        }
      }

      return {
        plan: createdPlan,
        dayCount: normalizedDays.length,
        exerciseCount,
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("[plans:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const plans = await prisma.workoutPlan.findMany({
      where: { trainerId: trainerProfile.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            days: true,
            assignedPlans: true,
          },
        },
      },
    });

    return res.json({ plans: plans.map(mapPlan) });
  } catch (error) {
    console.error("[plans:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      include: {
        days: {
          orderBy: { sortOrder: "asc" },
          include: {
            exercises: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    if (!plan) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
      days: plan.days.map((day: (typeof plan.days)[number]) => ({
        id: day.id,
        planId: day.planId,
        name: day.name,
        description: day.description,
        sortOrder: day.sortOrder,
        exercises: day.exercises.map((exercise: (typeof day.exercises)[number]) => ({
          id: exercise.id,
          dayId: exercise.dayId,
          name: exercise.name,
          description: exercise.description,
          sets: exercise.sets,
          reps: exercise.reps,
          targetWeightKg: exercise.targetWeightKg,
          restSeconds: exercise.restSeconds,
          note: exercise.note,
          sortOrder: exercise.sortOrder,
          imageUrl: exercise.imageUrl,
          libraryId: null,
        })),
      })),
    });
  } catch (error) {
    console.error("[plans:detail] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name =
    typeof req.body?.name === "string"
      ? req.body.name.trim()
      : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    const updatedPlan = await prisma.workoutPlan.update({
      where: { id: existingPlan.id },
      data: {
        name,
        description,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      plan: {
        id: updatedPlan.id,
        name: updatedPlan.name,
        description: updatedPlan.description,
        createdAt: updatedPlan.createdAt,
        updatedAt: updatedPlan.updatedAt,
      },
    });
  } catch (error) {
    console.error("[plans:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.workoutPlan.delete({
      where: { id: existingPlan.id },
    });

    return res.json({
      deleted: true,
      planId: existingPlan.id,
    });
  } catch (error) {
    console.error("[plans:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.post("/:id/days", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lastDay = await tx.workoutDay.findFirst({
        where: { planId: existingPlan.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      const sortOrder = lastDay ? lastDay.sortOrder + 1 : 0;

      const day = await tx.workoutDay.create({
        data: {
          planId: existingPlan.id,
          name,
          description,
          sortOrder,
        },
        select: {
          id: true,
          planId: true,
          name: true,
          description: true,
          sortOrder: true,
          createdAt: true,
        },
      });

      const assignedPlans = await tx.assignedPlan.findMany({
        where: {
          planId: existingPlan.id,
          active: true,
        },
        select: {
          client: {
            select: {
              userId: true,
            },
          },
        },
      });

      const recipientUserIds = Array.from(
        new Set(
          assignedPlans
            .map((item) => item.client.userId)
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );

      let notificationCount = 0;
      if (recipientUserIds.length > 0) {
        const created = await tx.notification.createMany({
          data: recipientUserIds.map((userId) => ({
            userId,
            type: "WORKOUT",
            title: "Neues Workout hinzugefügt",
            body: `${existingPlan.name}: ${day.name}`,
          })),
        });
        notificationCount = created.count;
      }

      return { day, notificationCount };
    });

    return res.status(201).json({
      day: {
        id: result.day.id,
        planId: result.day.planId,
        name: result.day.name,
        description: result.day.description,
        sortOrder: result.day.sortOrder,
        createdAt: result.day.createdAt,
      },
      notificationCount: result.notificationCount,
    });
  } catch (error) {
    console.error("[plans:create-day] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.post("/:id/assignments", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!plan) {
      return res.status(404).json({ message: "Not found" });
    }

    const client = await prisma.clientProfile.findFirst({
      where: {
        id: clientId,
        trainerId: trainerProfile.id,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Not found" });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.assignedPlan.updateMany({
        where: {
          clientId: client.id,
          active: true,
        },
        data: {
          active: false,
        },
      });

      const existing = await tx.assignedPlan.findUnique({
        where: {
          clientId_planId: {
            clientId: client.id,
            planId: plan.id,
          },
        },
        select: {
          id: true,
        },
      });

      const assignment = existing
        ? await tx.assignedPlan.update({
            where: { id: existing.id },
            data: {
              active: true,
              assignedAt: now,
            },
            select: {
              id: true,
              clientId: true,
              planId: true,
              active: true,
              assignedAt: true,
            },
          })
        : await tx.assignedPlan.create({
            data: {
              clientId: client.id,
              planId: plan.id,
              active: true,
              assignedAt: now,
            },
            select: {
              id: true,
              clientId: true,
              planId: true,
              active: true,
              assignedAt: true,
            },
          });

      let notificationCreated = false;
      if (client.userId) {
        await tx.notification.create({
          data: {
            userId: client.userId,
            type: "WORKOUT_PLAN",
            title: "Neuer Trainingsplan zugewiesen",
            body: plan.name,
          },
        });
        notificationCreated = true;
      }

      return { assignment, notificationCreated };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("[plans:assign] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

workoutDaysRouter.patch("/:dayId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        plan: {
          trainerId: trainerProfile.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    const updatedDay = await prisma.workoutDay.update({
      where: { id: existingDay.id },
      data: {
        name,
        description,
      },
      select: {
        id: true,
        planId: true,
        name: true,
        description: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return res.json({
      day: {
        id: updatedDay.id,
        planId: updatedDay.planId,
        name: updatedDay.name,
        description: updatedDay.description,
        sortOrder: updatedDay.sortOrder,
        createdAt: updatedDay.createdAt,
      },
    });
  } catch (error) {
    console.error("[plans:update-day] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

workoutDaysRouter.delete("/:dayId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        plan: {
          trainerId: trainerProfile.id,
        },
      },
      select: { id: true },
    });

    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.workoutDay.delete({
      where: { id: existingDay.id },
    });

    return res.json({
      deleted: true,
      dayId: existingDay.id,
    });
  } catch (error) {
    console.error("[plans:delete-day] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

workoutDaysRouter.post("/:dayId/exercises", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;
  const setsInput = req.body?.sets;
  const sets =
    typeof setsInput === "number" && Number.isInteger(setsInput) && setsInput > 0
      ? setsInput
      : 3;
  const repsInput = req.body?.reps;
  const reps = typeof repsInput === "string" && repsInput.trim() ? repsInput.trim() : "10";
  const targetWeightKgInput = req.body?.targetWeightKg;
  const targetWeightKg =
    targetWeightKgInput === null
      ? null
      : typeof targetWeightKgInput === "number" && Number.isFinite(targetWeightKgInput)
        ? targetWeightKgInput
        : null;
  const restSecondsInput = req.body?.restSeconds;
  const restSeconds =
    restSecondsInput === null
      ? null
      : typeof restSecondsInput === "number" && Number.isFinite(restSecondsInput)
        ? restSecondsInput
        : null;
  const noteInput = req.body?.note;
  const note = noteInput === null ? null : typeof noteInput === "string" ? noteInput : null;
  const imageUrlInput = req.body?.imageUrl;
  const imageUrl = imageUrlInput === null ? null : typeof imageUrlInput === "string" ? imageUrlInput : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        plan: {
          trainerId: trainerProfile.id,
        },
      },
      select: { id: true },
    });

    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    const lastExercise = await prisma.exercise.findFirst({
      where: { dayId: existingDay.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const sortOrder = lastExercise ? lastExercise.sortOrder + 1 : 0;

    const createdExercise = await prisma.exercise.create({
      data: {
        dayId: existingDay.id,
        name,
        description,
        sets,
        reps,
        targetWeightKg,
        restSeconds,
        note,
        sortOrder,
        imageUrl,
      },
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
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      exercise: {
        ...createdExercise,
        libraryId: null,
      },
    });
  } catch (error) {
    console.error("[plans:create-exercise] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.get("/library", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const searchInput = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const muscleGroupInput =
    typeof req.query.muscleGroup === "string" ? req.query.muscleGroup.trim() : "";
  const limitInput = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
  const limit = Number.isFinite(limitInput) && limitInput > 0 ? Math.min(limitInput, 1000) : 500;

  const where: {
    name?: { contains: string; mode: "insensitive" };
    muscleGroup?: string;
  } = {};

  if (searchInput) {
    where.name = {
      contains: searchInput,
      mode: "insensitive",
    };
  }

  if (muscleGroupInput) {
    where.muscleGroup = muscleGroupInput;
  }

  try {
    const exercises = await prisma.exerciseLibrary.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ exercises });
  } catch (error) {
    console.error("[exercises:library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.post("/library", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const muscleGroupInput = req.body?.muscleGroup;
  const equipmentInput = req.body?.equipment;
  const imageUrlInput = req.body?.imageUrl;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (
    !(muscleGroupInput === null || muscleGroupInput === undefined || typeof muscleGroupInput === "string") ||
    !(equipmentInput === null || equipmentInput === undefined || typeof equipmentInput === "string") ||
    !(imageUrlInput === null || imageUrlInput === undefined || typeof imageUrlInput === "string")
  ) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const created = await prisma.exerciseLibrary.create({
      data: {
        name,
        muscleGroup: typeof muscleGroupInput === "string" ? muscleGroupInput.trim() || null : null,
        equipment: typeof equipmentInput === "string" ? equipmentInput.trim() || null : null,
        imageUrl: typeof imageUrlInput === "string" ? imageUrlInput.trim() || null : null,
      },
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ exercise: created });
  } catch (error) {
    console.error("[exercises:create-library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.patch("/library/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    return res.status(404).json({ message: "Not found" });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "name");
  const hasMuscleGroup = Object.prototype.hasOwnProperty.call(req.body ?? {}, "muscleGroup");
  const hasEquipment = Object.prototype.hasOwnProperty.call(req.body ?? {}, "equipment");
  const hasImageUrl = Object.prototype.hasOwnProperty.call(req.body ?? {}, "imageUrl");

  const data: {
    name?: string;
    muscleGroup?: string | null;
    equipment?: string | null;
    imageUrl?: string | null;
  } = {};

  if (hasName) {
    if (typeof req.body?.name !== "string" || !req.body.name.trim()) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = req.body.name.trim();
  }

  if (hasMuscleGroup) {
    if (!(req.body?.muscleGroup === null || typeof req.body?.muscleGroup === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.muscleGroup =
      typeof req.body?.muscleGroup === "string" ? req.body.muscleGroup.trim() || null : null;
  }

  if (hasEquipment) {
    if (!(req.body?.equipment === null || typeof req.body?.equipment === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.equipment = typeof req.body?.equipment === "string" ? req.body.equipment.trim() || null : null;
  }

  if (hasImageUrl) {
    if (!(req.body?.imageUrl === null || typeof req.body?.imageUrl === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() || null : null;
  }

  try {
    const existing = await prisma.exerciseLibrary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const updated = await prisma.exerciseLibrary.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ exercise: updated });
  } catch (error) {
    console.error("[exercises:update-library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.delete("/library/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const existing = await prisma.exerciseLibrary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.exerciseLibrary.delete({ where: { id } });
    return res.json({ deleted: true, id });
  } catch (error) {
    console.error("[exercises:delete-library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.patch("/:exerciseId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const exerciseIdParam = req.params.exerciseId;
  const exerciseId = Array.isArray(exerciseIdParam) ? exerciseIdParam[0] : exerciseIdParam;
  if (!exerciseId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;
  const setsInput = req.body?.sets;
  const sets =
    typeof setsInput === "number" && Number.isInteger(setsInput) && setsInput > 0
      ? setsInput
      : 3;
  const repsInput = req.body?.reps;
  const reps = typeof repsInput === "string" && repsInput.trim() ? repsInput.trim() : "10";
  const targetWeightKgInput = req.body?.targetWeightKg;
  const targetWeightKg =
    targetWeightKgInput === null
      ? null
      : typeof targetWeightKgInput === "number" && Number.isFinite(targetWeightKgInput)
        ? targetWeightKgInput
        : null;
  const restSecondsInput = req.body?.restSeconds;
  const restSeconds =
    restSecondsInput === null
      ? null
      : typeof restSecondsInput === "number" && Number.isFinite(restSecondsInput)
        ? restSecondsInput
        : null;
  const noteInput = req.body?.note;
  const note = noteInput === null ? null : typeof noteInput === "string" ? noteInput : null;
  const imageUrlInput = req.body?.imageUrl;
  const imageUrl = imageUrlInput === null ? null : typeof imageUrlInput === "string" ? imageUrlInput : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingExercise = await prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        day: {
          plan: {
            trainerId: trainerProfile.id,
          },
        },
      },
      select: { id: true },
    });

    if (!existingExercise) {
      return res.status(404).json({ message: "Not found" });
    }

    const updatedExercise = await prisma.exercise.update({
      where: { id: existingExercise.id },
      data: {
        name,
        description,
        sets,
        reps,
        targetWeightKg,
        restSeconds,
        note,
        imageUrl,
      },
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
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      exercise: {
        ...updatedExercise,
        libraryId: null,
      },
    });
  } catch (error) {
    console.error("[plans:update-exercise] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.delete("/:exerciseId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const exerciseIdParam = req.params.exerciseId;
  const exerciseId = Array.isArray(exerciseIdParam) ? exerciseIdParam[0] : exerciseIdParam;
  if (!exerciseId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingExercise = await prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        day: {
          plan: {
            trainerId: trainerProfile.id,
          },
        },
      },
      select: { id: true },
    });

    if (!existingExercise) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.exercise.delete({
      where: { id: existingExercise.id },
    });

    return res.json({
      deleted: true,
      exerciseId: existingExercise.id,
    });
  } catch (error) {
    console.error("[plans:delete-exercise] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { plansRouter, workoutDaysRouter, exercisesRouter };
