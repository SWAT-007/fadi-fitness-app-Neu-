import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const plansRouter = Router();

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

export { plansRouter };
