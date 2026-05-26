import { Router } from "express";
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

// WorkoutLog model does not exist in the current schema — deferred migration
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

export { meRouter };
