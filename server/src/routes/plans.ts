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

export { plansRouter };
