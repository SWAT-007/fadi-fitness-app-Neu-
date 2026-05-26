import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

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

export { nutritionRouter };

