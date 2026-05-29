import path from "path";
import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { parseAllPdfsInDir, type ParsedRecipe } from "../../../lib/recipeParser";

const nutritionRouter = Router();

const normalizeOptionalString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
};

const mapNutritionPlan = (plan: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    meals: number;
    assignedNutritionPlans: number;
  };
}) => ({
  id: plan.id,
  name: plan.name,
  description: plan.description,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
  mealCount: plan._count.meals,
  assignmentCount: plan._count.assignedNutritionPlans,
});

const mapNutritionPlanDetail = (plan: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: plan.id,
  name: plan.name,
  description: plan.description,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
});

nutritionRouter.get("/foods", requireAuth, async (req: AuthenticatedRequest, res) => {
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

    const foods = await prisma.food.findMany({
      where: {
        OR: [{ trainerId: trainerProfile.id }, { trainerId: null }],
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
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ foods });
  } catch (error) {
    console.error("[nutrition:foods:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.post("/foods", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const caloriesPer100g = normalizeOptionalNumber(req.body?.caloriesPer100g);
  const proteinPer100g = normalizeOptionalNumber(req.body?.proteinPer100g);
  const carbsPer100g = normalizeOptionalNumber(req.body?.carbsPer100g);
  const fatPer100g = normalizeOptionalNumber(req.body?.fatPer100g);
  const unit = normalizeOptionalString(req.body?.unit);

  const hasInvalidMacro =
    !(
      req.body?.caloriesPer100g === undefined ||
      req.body?.caloriesPer100g === null ||
      req.body?.caloriesPer100g === "" ||
      (typeof req.body?.caloriesPer100g === "number" && Number.isFinite(req.body.caloriesPer100g))
    ) ||
    !(
      req.body?.proteinPer100g === undefined ||
      req.body?.proteinPer100g === null ||
      req.body?.proteinPer100g === "" ||
      (typeof req.body?.proteinPer100g === "number" && Number.isFinite(req.body.proteinPer100g))
    ) ||
    !(
      req.body?.carbsPer100g === undefined ||
      req.body?.carbsPer100g === null ||
      req.body?.carbsPer100g === "" ||
      (typeof req.body?.carbsPer100g === "number" && Number.isFinite(req.body.carbsPer100g))
    ) ||
    !(
      req.body?.fatPer100g === undefined ||
      req.body?.fatPer100g === null ||
      req.body?.fatPer100g === "" ||
      (typeof req.body?.fatPer100g === "number" && Number.isFinite(req.body.fatPer100g))
    );

  if (hasInvalidMacro) {
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

    const food = await prisma.food.create({
      data: {
        trainerId: trainerProfile.id,
        name,
        caloriesPer100g,
        proteinPer100g,
        carbsPer100g,
        fatPer100g,
        unit,
      },
      select: {
        id: true,
        name: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        unit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ food });
  } catch (error) {
    console.error("[nutrition:foods:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/foods/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const foodId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!foodId) {
    return res.status(404).json({ message: "Not found" });
  }

  const data: {
    name?: string;
    caloriesPer100g?: number | null;
    proteinPer100g?: number | null;
    carbsPer100g?: number | null;
    fatPer100g?: number | null;
    unit?: string | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = name;
  }

  const numberFields = ["caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"] as const;
  for (const field of numberFields) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
      const value = req.body?.[field];
      if (
        !(
          value === null ||
          value === undefined ||
          value === "" ||
          (typeof value === "number" && Number.isFinite(value))
        )
      ) {
        return res.status(400).json({ message: "Invalid request" });
      }
      data[field] = normalizeOptionalNumber(value);
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "unit")) {
    const unitValue = req.body?.unit;
    if (!(unitValue === null || unitValue === undefined || typeof unitValue === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.unit = normalizeOptionalString(unitValue);
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingFood = await prisma.food.findFirst({
      where: {
        id: foodId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existingFood) {
      return res.status(404).json({ message: "Not found" });
    }

    const food = await prisma.food.update({
      where: { id: existingFood.id },
      data,
      select: {
        id: true,
        name: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        unit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ food });
  } catch (error) {
    console.error("[nutrition:foods:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/foods/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const foodId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!foodId) {
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

    const existingFood = await prisma.food.findFirst({
      where: {
        id: foodId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existingFood) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.food.delete({ where: { id: existingFood.id } });
    return res.json({ deleted: true, id: existingFood.id });
  } catch (error) {
    console.error("[nutrition:foods:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.get("/plans", requireAuth, async (req: AuthenticatedRequest, res) => {
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

    const plans = await prisma.nutritionPlan.findMany({
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
            meals: true,
            assignedNutritionPlans: true,
          },
        },
      },
    });

    return res.json({ plans: plans.map(mapNutritionPlan) });
  } catch (error) {
    console.error("[nutrition:plans:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.post("/plans", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
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

    const plan = await prisma.nutritionPlan.create({
      data: {
        trainerId: trainerProfile.id,
        name,
        description,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            meals: true,
            assignedNutritionPlans: true,
          },
        },
      },
    });

    return res.status(201).json({ plan: mapNutritionPlan(plan) });
  } catch (error) {
    console.error("[nutrition:plans:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/plans/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
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

    const existingPlan = await prisma.nutritionPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.nutritionPlan.delete({
      where: { id: existingPlan.id },
    });

    return res.json({ deleted: true, id: existingPlan.id });
  } catch (error) {
    console.error("[nutrition:plans:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.get("/plans/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
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

    const plan = await prisma.nutritionPlan.findFirst({
      where: {
        id: planId,
        trainerId: trainerProfile.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!plan) {
      return res.status(404).json({ message: "Not found" });
    }

    const [meals, assignments, clients] = await Promise.all([
      prisma.nutritionMeal.findMany({
        where: { planId: plan.id },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          planId: true,
          name: true,
          description: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.assignedNutritionPlan.findMany({
        where: {
          planId: plan.id,
          client: {
            trainerId: trainerProfile.id,
          },
        },
        orderBy: { assignedAt: "desc" },
        select: {
          id: true,
          clientId: true,
          planId: true,
          active: true,
          assignedAt: true,
          client: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      prisma.clientProfile.findMany({
        where: { trainerId: trainerProfile.id },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      }),
    ]);

    return res.json({
      plan: mapNutritionPlanDetail(plan),
      meals,
      assignments,
      clients,
    });
  } catch (error) {
    console.error("[nutrition:plans:detail] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/plans/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const data: { name?: string; description?: string | null } = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "description")) {
    const desc = req.body?.description;
    if (!(desc === null || desc === undefined || typeof desc === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.description = typeof desc === "string" ? desc.trim() || null : null;
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingPlan = await prisma.nutritionPlan.findFirst({
      where: { id: planId, trainerId: trainerProfile.id },
      select: { id: true },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    const plan = await prisma.nutritionPlan.update({
      where: { id: existingPlan.id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ plan });
  } catch (error) {
    console.error("[nutrition:plans:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.post("/plans/:id/meals", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null || descriptionInput === undefined
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput.trim() || null
        : null;

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const plan = await prisma.nutritionPlan.findFirst({
      where: { id: planId, trainerId: trainerProfile.id },
      select: { id: true },
    });
    if (!plan) {
      return res.status(404).json({ message: "Not found" });
    }

    const lastMeal = await prisma.nutritionMeal.findFirst({
      where: { planId: plan.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = lastMeal ? lastMeal.sortOrder + 1 : 0;

    const meal = await prisma.nutritionMeal.create({
      data: { planId: plan.id, name, description, sortOrder },
      select: {
        id: true, planId: true, name: true, description: true,
        sortOrder: true, createdAt: true, updatedAt: true,
      },
    });

    return res.status(201).json({ meal });
  } catch (error) {
    console.error("[nutrition:meals:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/meals/:mealId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const mealIdParam = req.params.mealId;
  const mealId = Array.isArray(mealIdParam) ? mealIdParam[0] : mealIdParam;
  if (!mealId) {
    return res.status(404).json({ message: "Not found" });
  }

  const data: { name?: string; description?: string | null; sortOrder?: number } = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "description")) {
    const desc = req.body?.description;
    if (!(desc === null || desc === undefined || typeof desc === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.description = typeof desc === "string" ? desc.trim() || null : null;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "sortOrder")) {
    const so = req.body?.sortOrder;
    if (!Number.isInteger(so) || so < 0) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.sortOrder = so as number;
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existingMeal = await prisma.nutritionMeal.findFirst({
      where: { id: mealId, plan: { trainerId: trainerProfile.id } },
      select: { id: true },
    });
    if (!existingMeal) {
      return res.status(404).json({ message: "Not found" });
    }

    const meal = await prisma.nutritionMeal.update({
      where: { id: existingMeal.id },
      data,
      select: {
        id: true, planId: true, name: true, description: true,
        sortOrder: true, createdAt: true, updatedAt: true,
      },
    });

    return res.json({ meal });
  } catch (error) {
    console.error("[nutrition:meals:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/meals/:mealId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const mealIdParam = req.params.mealId;
  const mealId = Array.isArray(mealIdParam) ? mealIdParam[0] : mealIdParam;
  if (!mealId) {
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

    const existingMeal = await prisma.nutritionMeal.findFirst({
      where: { id: mealId, plan: { trainerId: trainerProfile.id } },
      select: { id: true },
    });
    if (!existingMeal) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.nutritionMeal.delete({ where: { id: existingMeal.id } });
    return res.json({ deleted: true, mealId: existingMeal.id });
  } catch (error) {
    console.error("[nutrition:meals:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Assignment select shape reused across POST/PATCH ────────────────────────

const assignmentSelect = {
  id: true,
  clientId: true,
  planId: true,
  active: true,
  assignedAt: true,
  client: { select: { id: true, fullName: true, email: true } },
  plan: { select: { id: true, name: true, description: true } },
} as const;

nutritionRouter.post("/plans/:id/assignments", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
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

    const [plan, client] = await Promise.all([
      prisma.nutritionPlan.findFirst({
        where: { id: planId, trainerId: trainerProfile.id },
        select: { id: true, name: true },
      }),
      prisma.clientProfile.findFirst({
        where: { id: clientId, trainerId: trainerProfile.id },
        select: { id: true, userId: true },
      }),
    ]);

    if (!plan) return res.status(404).json({ message: "Not found" });
    if (!client) return res.status(404).json({ message: "Client not found" });

    const { assignmentId, notificationCreated } = await prisma.$transaction(async (tx) => {
      await tx.assignedNutritionPlan.updateMany({
        where: { clientId: client.id, active: true, planId: { not: plan.id } },
        data: { active: false },
      });

      const upserted = await tx.assignedNutritionPlan.upsert({
        where: { clientId_planId: { clientId: client.id, planId: plan.id } },
        create: { clientId: client.id, planId: plan.id, active: true, assignedAt: new Date() },
        update: { active: true, assignedAt: new Date() },
        select: { id: true },
      });

      let notificationCreated = false;
      if (client.userId) {
        await tx.notification.create({
          data: {
            userId: client.userId,
            type: "NUTRITION_PLAN",
            title: "Neuer Ernährungsplan",
            body: `Dir wurde der Ernährungsplan "${plan.name}" zugewiesen.`,
          },
        });
        notificationCreated = true;
      }

      return { assignmentId: upserted.id, notificationCreated };
    });

    const assignment = await prisma.assignedNutritionPlan.findUnique({
      where: { id: assignmentId },
      select: assignmentSelect,
    });
    if (!assignment) {
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(201).json({ assignment, notificationCreated });
  } catch (error) {
    console.error("[nutrition:assignments:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/assignments/:assignmentId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const assignmentIdParam = req.params.assignmentId;
  const assignmentId = Array.isArray(assignmentIdParam) ? assignmentIdParam[0] : assignmentIdParam;
  if (!assignmentId) {
    return res.status(404).json({ message: "Not found" });
  }

  const activeValue = req.body?.active;
  if (typeof activeValue !== "boolean") {
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

    const existing = await prisma.assignedNutritionPlan.findFirst({
      where: {
        id: assignmentId,
        client: { trainerId: trainerProfile.id },
        plan: { trainerId: trainerProfile.id },
      },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const assignment = await prisma.assignedNutritionPlan.update({
      where: { id: existing.id },
      data: { active: activeValue },
      select: assignmentSelect,
    });

    return res.json({ assignment });
  } catch (error) {
    console.error("[nutrition:assignments:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/assignments/:assignmentId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const assignmentIdParam = req.params.assignmentId;
  const assignmentId = Array.isArray(assignmentIdParam) ? assignmentIdParam[0] : assignmentIdParam;
  if (!assignmentId) {
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

    const existing = await prisma.assignedNutritionPlan.findFirst({
      where: {
        id: assignmentId,
        client: { trainerId: trainerProfile.id },
        plan: { trainerId: trainerProfile.id },
      },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.assignedNutritionPlan.delete({ where: { id: existing.id } });
    return res.json({ deleted: true, assignmentId: existing.id });
  } catch (error) {
    console.error("[nutrition:assignments:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Recipes ──────────────────────────────────────────────────────────────────

const recipeSelect = {
  id: true,
  name: true,
  description: true,
  instructions: true,
  imageUrl: true,
  ingredients: true,
  servings: true,
  totalCalories: true,
  proteinG: true,
  carbsG: true,
  fatG: true,
  sourcePdf: true,
  category: true,
  prepTimeMinutes: true,
  cookTimeMinutes: true,
  createdAt: true,
  updatedAt: true,
} as const;

nutritionRouter.post("/recipes/import-pdfs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const pdfsDir = path.join(process.cwd(), "public", "pdfs");

    let parsedRecipes: ParsedRecipe[];
    try {
      parsedRecipes = await parseAllPdfsInDir(pdfsDir);
    } catch (parseErr) {
      console.error("[nutrition:recipes:import-pdfs] parse error:", parseErr);
      return res.status(500).json({ message: "PDF-Parsing fehlgeschlagen" });
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const r of parsedRecipes) {
      if (!r.name || r.name.trim().length < 2) { skipped++; continue; }

      try {
        const existing = await prisma.recipe.findFirst({
          where: { trainerId: trainerProfile.id, sourcePdf: r.source_pdf, name: r.name },
          select: { id: true },
        });

        // JSON.parse(JSON.stringify()) strips the typed array shape → assignable to Prisma Json
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const ingredientsJson = r.ingredients.length > 0 ? JSON.parse(JSON.stringify(r.ingredients)) : undefined;
        const data = {
          name: r.name,
          instructions: r.instructions || null,
          ingredients: ingredientsJson,
          servings: r.servings,
          totalCalories: r.total_calories,
          proteinG: r.protein_g,
          carbsG: r.carbs_g,
          fatG: r.fat_g,
          sourcePdf: r.source_pdf,
        };

        if (existing) {
          await prisma.recipe.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await prisma.recipe.create({ data: { ...data, trainerId: trainerProfile.id } });
          imported++;
        }
      } catch (recipeErr) {
        errors.push(`${r.name}: ${recipeErr instanceof Error ? recipeErr.message : String(recipeErr)}`);
      }
    }

    return res.json({ imported, updated, skipped, totalParsed: parsedRecipes.length, errors });
  } catch (error) {
    console.error("[nutrition:recipes:import-pdfs] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.get("/recipes", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const limitRaw = parseInt(String(req.query.limit ?? "100"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(300, Math.max(1, limitRaw)) : 100;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : null;

  try {
    let trainerId: string | null = null;

    if (req.user.role === "trainer") {
      const trainerProfile = await prisma.trainerProfile.findUnique({
        where: { userId: req.user.userId },
        select: { id: true },
      });
      if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });
      trainerId = trainerProfile.id;
    } else {
      const clientProfile = await prisma.clientProfile.findUnique({
        where: { userId: req.user.userId },
        select: { trainerId: true },
      });
      if (!clientProfile) return res.status(500).json({ message: "Internal server error" });
      trainerId = clientProfile.trainerId;
    }

    const recipes = await prisma.recipe.findMany({
      where: {
        OR: [{ trainerId }, { trainerId: null }],
        ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: limit,
      select: recipeSelect,
    });

    return res.json({ recipes });
  } catch (error) {
    console.error("[nutrition:recipes:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.post("/recipes", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const {
      name,
      description,
      instructions,
      imageUrl,
      ingredients,
      servings,
      totalCalories,
      proteinG,
      carbsG,
      fatG,
      sourcePdf,
      category,
      prepTimeMinutes,
      cookTimeMinutes,
    } = req.body as Record<string, unknown>;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "name is required" });
    }

    const recipe = await prisma.recipe.create({
      data: {
        trainerId: trainerProfile.id,
        name: name.trim(),
        description: typeof description === "string" ? description : null,
        instructions: typeof instructions === "string" ? instructions : null,
        imageUrl: typeof imageUrl === "string" ? imageUrl : null,
        ingredients: ingredients !== undefined ? (ingredients as object) : undefined,
        servings: typeof servings === "number" && Number.isFinite(servings) ? Math.round(servings) : null,
        totalCalories: typeof totalCalories === "number" && Number.isFinite(totalCalories) ? totalCalories : null,
        proteinG: typeof proteinG === "number" && Number.isFinite(proteinG) ? proteinG : null,
        carbsG: typeof carbsG === "number" && Number.isFinite(carbsG) ? carbsG : null,
        fatG: typeof fatG === "number" && Number.isFinite(fatG) ? fatG : null,
        sourcePdf: typeof sourcePdf === "string" ? sourcePdf : null,
        category: typeof category === "string" ? category.trim() : null,
        prepTimeMinutes: typeof prepTimeMinutes === "number" && Number.isFinite(prepTimeMinutes) ? Math.round(prepTimeMinutes) : null,
        cookTimeMinutes: typeof cookTimeMinutes === "number" && Number.isFinite(cookTimeMinutes) ? Math.round(cookTimeMinutes) : null,
      },
      select: recipeSelect,
    });

    return res.status(201).json({ recipe });
  } catch (error) {
    console.error("[nutrition:recipes:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/recipes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const recipeId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!recipeId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const existing = await prisma.recipe.findFirst({
      where: { id: recipeId, trainerId: trainerProfile.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ message: "Not found" });

    const {
      name,
      description,
      instructions,
      imageUrl,
      ingredients,
      servings,
      totalCalories,
      proteinG,
      carbsG,
      fatG,
      sourcePdf,
      category,
      prepTimeMinutes,
      cookTimeMinutes,
    } = req.body as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "name must be a non-empty string" });
      }
      data.name = name.trim();
    }
    if (description !== undefined) data.description = typeof description === "string" ? description : null;
    if (instructions !== undefined) data.instructions = typeof instructions === "string" ? instructions : null;
    if (imageUrl !== undefined) data.imageUrl = typeof imageUrl === "string" ? imageUrl : null;
    if (ingredients !== undefined) data.ingredients = ingredients as object;
    if (servings !== undefined) data.servings = typeof servings === "number" && Number.isFinite(servings) ? Math.round(servings) : null;
    if (totalCalories !== undefined) data.totalCalories = typeof totalCalories === "number" && Number.isFinite(totalCalories) ? totalCalories : null;
    if (proteinG !== undefined) data.proteinG = typeof proteinG === "number" && Number.isFinite(proteinG) ? proteinG : null;
    if (carbsG !== undefined) data.carbsG = typeof carbsG === "number" && Number.isFinite(carbsG) ? carbsG : null;
    if (fatG !== undefined) data.fatG = typeof fatG === "number" && Number.isFinite(fatG) ? fatG : null;
    if (sourcePdf !== undefined) data.sourcePdf = typeof sourcePdf === "string" ? sourcePdf : null;
    if (category !== undefined) data.category = typeof category === "string" ? category.trim() : null;
    if (prepTimeMinutes !== undefined) data.prepTimeMinutes = typeof prepTimeMinutes === "number" && Number.isFinite(prepTimeMinutes) ? Math.round(prepTimeMinutes) : null;
    if (cookTimeMinutes !== undefined) data.cookTimeMinutes = typeof cookTimeMinutes === "number" && Number.isFinite(cookTimeMinutes) ? Math.round(cookTimeMinutes) : null;

    const recipe = await prisma.recipe.update({
      where: { id: existing.id },
      data,
      select: recipeSelect,
    });

    return res.json({ recipe });
  } catch (error) {
    console.error("[nutrition:recipes:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/recipes/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const recipeId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!recipeId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, trainerId: trainerProfile.id },
      select: { id: true },
    });
    if (!recipe) return res.status(404).json({ message: "Not found" });

    await prisma.recipe.delete({ where: { id: recipe.id } });
    return res.json({ deleted: true, recipeId: recipe.id });
  } catch (error) {
    console.error("[nutrition:recipes:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { nutritionRouter };
