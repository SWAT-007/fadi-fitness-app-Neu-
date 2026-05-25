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

export { plansRouter };
