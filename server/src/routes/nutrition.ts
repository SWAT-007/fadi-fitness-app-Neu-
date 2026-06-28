import path from "path";
import { Router } from "express";
import { prisma } from "../db";
import { resolveScope } from "../lib/scope";
import { isTrainerOrAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { parseAllPdfsInDir, type ParsedRecipe } from "../../../lib/recipeParser";
import { pushNotify, PUSH_TEXTS } from "./notificationHelpers";

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

// Per-meal macro target select fields (shared across meal endpoints)
const mealTargetSelect = {
  targetProtein: true,
  targetCarbs: true,
  targetFat: true,
  targetVegetableG: true,
  allowedCategories: true,
} as const;

const toNullableNumber = (value: unknown): number | null =>
  value === null || value === undefined || value === ""
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;

// allowedCategories: accept a string array (stored as JSON), else null.
const toAllowedCategories = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === "string")
    ? (value as string[])
    : null;

nutritionRouter.get("/foods", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const scope = await resolveScope(req.user);

    const foods = await prisma.food.findMany({
      where: scope.filterTrainerId
        ? {
            OR: [{ trainerId: scope.filterTrainerId }, { trainerId: null }],
          }
        : {},
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        unit: true,
        category: true,
        brand: true,
        barcode: true,
        defaultServingG: true,
        source: true,
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
  const category = normalizeOptionalString(req.body?.category);
  const brand = normalizeOptionalString(req.body?.brand);
  const barcode = normalizeOptionalString(req.body?.barcode);
  const source = normalizeOptionalString(req.body?.source);
  const defaultServingG = normalizeOptionalNumber(req.body?.defaultServingG);

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

  const hasInvalidServing = !(
    req.body?.defaultServingG === undefined ||
    req.body?.defaultServingG === null ||
    req.body?.defaultServingG === "" ||
    (typeof req.body?.defaultServingG === "number" && Number.isFinite(req.body.defaultServingG))
  );

  if (hasInvalidMacro || hasInvalidServing) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);
    const ownedTrainerId = scope.trainerProfileId;
    if (!ownedTrainerId) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const food = await prisma.food.create({
      data: {
        trainerId: ownedTrainerId,
        name,
        caloriesPer100g,
        proteinPer100g,
        carbsPer100g,
        fatPer100g,
        unit,
        category,
        brand,
        barcode,
        defaultServingG,
        source,
      },
      select: {
        id: true,
        name: true,
        caloriesPer100g: true,
        proteinPer100g: true,
        carbsPer100g: true,
        fatPer100g: true,
        unit: true,
        category: true,
        brand: true,
        barcode: true,
        defaultServingG: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ food });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({ message: "Barcode bereits vergeben" });
    }
    console.error("[nutrition:foods:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/foods/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
    category?: string | null;
    brand?: string | null;
    barcode?: string | null;
    defaultServingG?: number | null;
    source?: string | null;
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

  const stringOptFields = ["category", "brand", "barcode", "source"] as const;
  for (const field of stringOptFields) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
      const value = req.body?.[field];
      if (!(value === null || value === undefined || typeof value === "string")) {
        return res.status(400).json({ message: "Invalid request" });
      }
      data[field] = normalizeOptionalString(value);
    }
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "defaultServingG")) {
    const value = req.body?.defaultServingG;
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
    data.defaultServingG = normalizeOptionalNumber(value);
  }

  try {
    const scope = await resolveScope(req.user);

    const existingFood = await prisma.food.findFirst({
      where: {
        id: foodId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
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
        category: true,
        brand: true,
        barcode: true,
        defaultServingG: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ food });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return res.status(409).json({ message: "Barcode bereits vergeben" });
    }
    console.error("[nutrition:foods:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/foods/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const foodId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!foodId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingFood = await prisma.food.findFirst({
      where: {
        id: foodId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
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

// ─── Drinks catalog (kcal only, per 100 ml) — analog zu Foods ────────────────

const drinkSelect = {
  id: true,
  name: true,
  kcalPer100ml: true,
  unit: true,
  createdAt: true,
  updatedAt: true,
} as const;

nutritionRouter.get("/drinks", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const scope = await resolveScope(req.user);

    const drinks = await prisma.drink.findMany({
      where: scope.filterTrainerId
        ? { OR: [{ trainerId: scope.filterTrainerId }, { trainerId: null }] }
        : {},
      orderBy: { name: "asc" },
      select: drinkSelect,
    });

    return res.json({ drinks });
  } catch (error) {
    console.error("[nutrition:drinks:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.post("/drinks", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const kcalInput = req.body?.kcalPer100ml;
  const kcalValid =
    kcalInput === undefined || kcalInput === null || kcalInput === "" ||
    (typeof kcalInput === "number" && Number.isFinite(kcalInput));
  if (!kcalValid) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const kcalPer100ml = normalizeOptionalNumber(kcalInput);
  const unit = normalizeOptionalString(req.body?.unit);

  try {
    const scope = await resolveScope(req.user);
    const ownedTrainerId = scope.trainerProfileId;
    if (!ownedTrainerId) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const drink = await prisma.drink.create({
      data: { trainerId: ownedTrainerId, name, kcalPer100ml, unit },
      select: drinkSelect,
    });

    return res.status(201).json({ drink });
  } catch (error) {
    console.error("[nutrition:drinks:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/drinks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const drinkId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!drinkId) {
    return res.status(404).json({ message: "Not found" });
  }

  const data: { name?: string; kcalPer100ml?: number | null; unit?: string | null } = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "kcalPer100ml")) {
    const value = req.body?.kcalPer100ml;
    if (
      !(value === null || value === undefined || value === "" ||
        (typeof value === "number" && Number.isFinite(value)))
    ) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.kcalPer100ml = normalizeOptionalNumber(value);
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "unit")) {
    const value = req.body?.unit;
    if (!(value === null || value === undefined || typeof value === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.unit = normalizeOptionalString(value);
  }

  try {
    const scope = await resolveScope(req.user);

    const existing = await prisma.drink.findFirst({
      where: {
        id: drinkId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const drink = await prisma.drink.update({
      where: { id: existing.id },
      data,
      select: drinkSelect,
    });

    return res.json({ drink });
  } catch (error) {
    console.error("[nutrition:drinks:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/drinks/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const drinkId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!drinkId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existing = await prisma.drink.findFirst({
      where: {
        id: drinkId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.drink.delete({ where: { id: existing.id } });
    return res.json({ deleted: true, id: existing.id });
  } catch (error) {
    console.error("[nutrition:drinks:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.get("/plans", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const scope = await resolveScope(req.user);

    const plans = await prisma.nutritionPlan.findMany({
      where: {
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
    const scope = await resolveScope(req.user);
    const ownedTrainerId = scope.trainerProfileId;
    if (!ownedTrainerId) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const plan = await prisma.nutritionPlan.create({
      data: {
        trainerId: ownedTrainerId,
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingPlan = await prisma.nutritionPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const planId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const plan = await prisma.nutritionPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
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
          ...mealTargetSelect,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.assignedNutritionPlan.findMany({
        where: {
          planId: plan.id,
          ...(scope.filterTrainerId && {
            client: {
              trainerId: scope.filterTrainerId,
            },
          }),
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
        where: {
          ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
        },
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
    const scope = await resolveScope(req.user);

    const existingPlan = await prisma.nutritionPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
    const scope = await resolveScope(req.user);

    const plan = await prisma.nutritionPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
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
      data: {
        planId: plan.id,
        name,
        description,
        sortOrder,
        targetProtein: toNullableNumber(req.body?.targetProtein),
        targetCarbs: toNullableNumber(req.body?.targetCarbs),
        targetFat: toNullableNumber(req.body?.targetFat),
        targetVegetableG: toNullableNumber(req.body?.targetVegetableG),
        allowedCategories: toAllowedCategories(req.body?.allowedCategories) ?? undefined,
      },
      select: {
        id: true, planId: true, name: true, description: true,
        sortOrder: true, ...mealTargetSelect, createdAt: true, updatedAt: true,
      },
    });

    return res.status(201).json({ meal });
  } catch (error) {
    console.error("[nutrition:meals:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.patch("/meals/:mealId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const mealIdParam = req.params.mealId;
  const mealId = Array.isArray(mealIdParam) ? mealIdParam[0] : mealIdParam;
  if (!mealId) {
    return res.status(404).json({ message: "Not found" });
  }

  const data: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    targetProtein?: number | null;
    targetCarbs?: number | null;
    targetFat?: number | null;
    targetVegetableG?: number | null;
    allowedCategories?: string[];
  } = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "name")) {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = name;
  }

  for (const field of ["targetProtein", "targetCarbs", "targetFat", "targetVegetableG"] as const) {
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
      data[field] = toNullableNumber(req.body?.[field]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "allowedCategories")) {
    const parsed = toAllowedCategories(req.body?.allowedCategories);
    if (parsed) data.allowedCategories = parsed;
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
    const scope = await resolveScope(req.user);

    const existingMeal = await prisma.nutritionMeal.findFirst({
      where: {
        id: mealId,
        ...(scope.filterTrainerId && {
          plan: { trainerId: scope.filterTrainerId },
        }),
      },
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
        sortOrder: true, ...mealTargetSelect, createdAt: true, updatedAt: true,
      },
    });

    return res.json({ meal });
  } catch (error) {
    console.error("[nutrition:meals:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.delete("/meals/:mealId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const mealIdParam = req.params.mealId;
  const mealId = Array.isArray(mealIdParam) ? mealIdParam[0] : mealIdParam;
  if (!mealId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingMeal = await prisma.nutritionMeal.findFirst({
      where: {
        id: mealId,
        ...(scope.filterTrainerId && {
          plan: { trainerId: scope.filterTrainerId },
        }),
      },
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
    const scope = await resolveScope(req.user);

    const [plan, client] = await Promise.all([
      prisma.nutritionPlan.findFirst({
        where: {
          id: planId,
          ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
        },
        select: { id: true, name: true },
      }),
      prisma.clientProfile.findFirst({
        where: {
          id: clientId,
          ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
        },
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

    if (notificationCreated && client.userId) {
      pushNotify(client.userId, PUSH_TEXTS.nutritionPlan, "/client/nutrition", "nutrition_plan");
    }

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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
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
    const scope = await resolveScope(req.user);

    const existing = await prisma.assignedNutritionPlan.findFirst({
      where: {
        id: assignmentId,
        ...(scope.filterTrainerId && {
          client: { trainerId: scope.filterTrainerId },
          plan: { trainerId: scope.filterTrainerId },
        }),
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const assignmentIdParam = req.params.assignmentId;
  const assignmentId = Array.isArray(assignmentIdParam) ? assignmentIdParam[0] : assignmentIdParam;
  if (!assignmentId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existing = await prisma.assignedNutritionPlan.findFirst({
      where: {
        id: assignmentId,
        ...(scope.filterTrainerId && {
          client: { trainerId: scope.filterTrainerId },
          plan: { trainerId: scope.filterTrainerId },
        }),
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const scope = await resolveScope(req.user);
    const ownedTrainerId = scope.trainerProfileId;
    if (!ownedTrainerId) return res.status(500).json({ message: "Internal server error" });

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
          where: {
            sourcePdf: r.source_pdf,
            name: r.name,
            ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
          },
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
          await prisma.recipe.create({ data: { ...data, trainerId: ownedTrainerId } });
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
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 100;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : null;

  try {
    if (isTrainerOrAdmin(req.user.role)) {
      const scope = await resolveScope(req.user);

      const recipes = await prisma.recipe.findMany({
        where: {
          ...(scope.filterTrainerId
            ? { OR: [{ trainerId: scope.filterTrainerId }, { trainerId: null }] }
            : {}),
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
        take: limit,
        select: recipeSelect,
      });

      return res.json({ recipes });
    } else {
      const clientProfile = await prisma.clientProfile.findUnique({
        where: { userId: req.user.userId },
        select: { trainerId: true },
      });
      if (!clientProfile) return res.status(500).json({ message: "Internal server error" });

      const recipes = await prisma.recipe.findMany({
        where: {
          OR: [{ trainerId: clientProfile.trainerId }, { trainerId: null }],
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
        take: limit,
        select: recipeSelect,
      });

      return res.json({ recipes });
    }
  } catch (error) {
    console.error("[nutrition:recipes:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

nutritionRouter.post("/recipes", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const scope = await resolveScope(req.user);
    const ownedTrainerId = scope.trainerProfileId;
    if (!ownedTrainerId) return res.status(500).json({ message: "Internal server error" });

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
        trainerId: ownedTrainerId,
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const recipeId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!recipeId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existing = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
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
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const recipeId = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!recipeId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const recipe = await prisma.recipe.findFirst({
      where: {
        id: recipeId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
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

