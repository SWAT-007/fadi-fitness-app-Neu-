import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function usage() {
  console.log(
    "Usage: node scripts/import-supabase-nutrition.mjs backups/supabase/<YYYY-MM-DD-HH-mm> [--apply --confirm]",
  );
}

function norm(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normEmail(v) {
  return norm(v).toLowerCase();
}

function normalizeNullableString(v) {
  const value = norm(v);
  return value.length > 0 ? value : null;
}

function getFirst(row, keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function toIso(v) {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toNumOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function addConflict(report, code, details = {}) {
  report.conflictCounts[code] = (report.conflictCounts[code] ?? 0) + 1;
  report.conflicts.push({ code, ...details });
}

function markSkipped(report, key, reason, details = {}) {
  report.tables[key].skipped += 1;
  report.tables[key].skippedByReason[reason] =
    (report.tables[key].skippedByReason[reason] ?? 0) + 1;
  addConflict(report, reason, { table: key, ...details });
}

async function loadJsonArray(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} must be a JSON array`);
  }
  return parsed;
}

function detectDuplicateIds(rows) {
  const seen = new Set();
  const dup = new Set();
  for (const row of rows) {
    const id = norm(row?.id);
    if (!id) continue;
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return dup;
}

function pickNewestAssignment(rows) {
  let best = rows[0];
  for (let i = 1; i < rows.length; i += 1) {
    const c = rows[i];
    const bAssigned = toIso(getFirst(best, ["assigned_at"]));
    const cAssigned = toIso(getFirst(c, ["assigned_at"]));
    if (cAssigned && (!bAssigned || cAssigned > bAssigned)) {
      best = c;
      continue;
    }
    if (bAssigned && cAssigned && cAssigned < bAssigned) continue;
    const bCreated = toIso(getFirst(best, ["created_at"]));
    const cCreated = toIso(getFirst(c, ["created_at"]));
    if (cCreated && (!bCreated || cCreated > bCreated)) {
      best = c;
    }
  }
  return best;
}

async function detectNutritionFiles(backupFolder) {
  const manifestPath = path.join(backupFolder, "manifest.json");
  let tables = [];
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    tables = Array.isArray(manifest?.tables) ? manifest.tables : [];
  } catch {
    tables = [];
  }

  const required = [
    "foods",
    "recipes",
    "nutrition_plans",
    "nutrition_meals",
    "assigned_nutrition_plans",
    "client_meal_foods",
    "meal_history",
    "meal_logs",
    "drink_logs",
  ];

  const resolved = {};
  for (const table of required) {
    const fromManifest = tables.find(
      (t) => norm(t?.table).toLowerCase() === table && norm(t?.file).length > 0,
    );
    const fileName = fromManifest ? norm(fromManifest.file) : `${table}.json`;
    const full = path.join(backupFolder, fileName);
    try {
      await readFile(full, "utf8");
    } catch {
      throw new Error(`Missing required backup file for ${table} (${fileName})`);
    }
    resolved[table] = fileName;
  }
  return resolved;
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const apply = process.argv.includes("--apply") && process.argv.includes("--confirm");
  const mode = apply ? "apply" : "dry-run";
  const backupFolder = path.resolve(process.cwd(), folderArg);
  const reportPath = path.join(backupFolder, "import-nutrition-report.json");

  let files;
  try {
    files = await detectNutritionFiles(backupFolder);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const source = {};
  try {
    for (const [table, fileName] of Object.entries(files)) {
      source[table] = await loadJsonArray(path.join(backupFolder, fileName));
    }
  } catch (error) {
    console.error(`Failed to read JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    backupFolder: path.relative(process.cwd(), backupFolder),
    inputFiles: files,
    sourceTotals: Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v.length])),
    tables: Object.fromEntries(
      Object.keys(source).map((k) => [
        k,
        {
          created: 0,
          importable: 0,
          skipped: 0,
          skippedExisting: 0,
          skippedDuplicate: 0,
          skippedByReason: {},
        },
      ]),
    ),
    conflictCounts: {},
    conflicts: [],
    relationshipSummary: {
      trainerMappingFailures: 0,
      clientMappingFailures: 0,
      planMappingFailures: 0,
      mealMappingFailures: 0,
      foodMappingFailures: 0,
      assignmentFinalPairDuplicatesInSource: 0,
      assignmentFinalPairAlreadyExistsLocal: 0,
    },
    summary: {
      totalCreated: 0,
      totalImportable: 0,
      totalSkipped: 0,
    },
  };

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const safeFindMany = async (label, fn) => {
    try {
      return await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("does not exist in the current database")) {
        addConflict(report, "LOCAL_TABLE_MISSING", { table: label, message: msg });
        if (apply) throw new Error(`Cannot apply import, local table missing: ${label}`);
        return [];
      }
      throw error;
    }
  };

  let users;
  let trainerProfiles;
  let clientProfiles;
  let localFoods;
  let localRecipes;
  let localPlans;
  let localMeals;
  let localAssigned;
  let localClientMealFoods;
  let localMealHistory;
  let localMealLogs;
  let localDrinkLogs;

  try {
    [
      users,
      trainerProfiles,
      clientProfiles,
      localFoods,
      localRecipes,
      localPlans,
      localMeals,
      localAssigned,
      localClientMealFoods,
      localMealHistory,
      localMealLogs,
      localDrinkLogs,
    ] = await Promise.all([
      safeFindMany("User", () => prisma.user.findMany({ select: { id: true, email: true, legacySupabaseProfileId: true } })),
      safeFindMany("TrainerProfile", () => prisma.trainerProfile.findMany({ select: { id: true, userId: true } })),
      safeFindMany("ClientProfile", () =>
        prisma.clientProfile.findMany({
          select: { id: true, trainerId: true, legacySupabaseClientId: true },
        }),
      ),
      safeFindMany("Food", () => prisma.food.findMany({ select: { id: true, legacySupabaseFoodId: true } })),
      safeFindMany("Recipe", () => prisma.recipe.findMany({ select: { id: true, legacySupabaseRecipeId: true } })),
      safeFindMany("NutritionPlan", () =>
        prisma.nutritionPlan.findMany({
          select: { id: true, trainerId: true, name: true, legacySupabaseNutritionPlanId: true },
        }),
      ),
      safeFindMany("NutritionMeal", () =>
        prisma.nutritionMeal.findMany({
          select: { id: true, planId: true, legacySupabaseNutritionMealId: true },
        }),
      ),
      safeFindMany("AssignedNutritionPlan", () =>
        prisma.assignedNutritionPlan.findMany({
          select: {
            id: true,
            clientId: true,
            planId: true,
            active: true,
            assignedAt: true,
            legacySupabaseAssignedNutritionPlanId: true,
          },
        }),
      ),
      safeFindMany("ClientMealFood", () =>
        prisma.clientMealFood.findMany({ select: { id: true, legacySupabaseClientMealFoodId: true } }),
      ),
      safeFindMany("MealHistory", () =>
        prisma.mealHistory.findMany({ select: { id: true, legacySupabaseMealHistoryId: true } }),
      ),
      safeFindMany("MealLog", () => prisma.mealLog.findMany({ select: { id: true, legacySupabaseMealLogId: true } })),
      safeFindMany("DrinkLog", () =>
        prisma.drinkLog.findMany({ select: { id: true, legacySupabaseDrinkLogId: true } }),
      ),
    ]);
  } catch (error) {
    await prisma.$disconnect();
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const userByLegacy = new Map(
    users
      .filter((u) => norm(u.legacySupabaseProfileId))
      .map((u) => [u.legacySupabaseProfileId, u]),
  );
  const userByEmail = new Map(users.map((u) => [normEmail(u.email), u]));
  const trainerByUserId = new Map(trainerProfiles.map((t) => [t.userId, t]));
  const clientByLegacyClientId = new Map(
    clientProfiles
      .filter((c) => norm(c.legacySupabaseClientId))
      .map((c) => [c.legacySupabaseClientId, c]),
  );

  const foodByLegacy = new Map(
    localFoods
      .filter((r) => norm(r.legacySupabaseFoodId))
      .map((r) => [r.legacySupabaseFoodId, r]),
  );
  const recipeByLegacy = new Map(
    localRecipes
      .filter((r) => norm(r.legacySupabaseRecipeId))
      .map((r) => [r.legacySupabaseRecipeId, r]),
  );
  const planByLegacy = new Map(
    localPlans
      .filter((r) => norm(r.legacySupabaseNutritionPlanId))
      .map((r) => [r.legacySupabaseNutritionPlanId, r]),
  );
  const mealByLegacy = new Map(
    localMeals
      .filter((r) => norm(r.legacySupabaseNutritionMealId))
      .map((r) => [r.legacySupabaseNutritionMealId, r]),
  );
  const assignedByLegacy = new Map(
    localAssigned
      .filter((r) => norm(r.legacySupabaseAssignedNutritionPlanId))
      .map((r) => [r.legacySupabaseAssignedNutritionPlanId, r]),
  );
  const assignedByPair = new Map(localAssigned.map((r) => [`${r.clientId}::${r.planId}`, r]));
  const clientMealFoodByLegacy = new Map(
    localClientMealFoods
      .filter((r) => norm(r.legacySupabaseClientMealFoodId))
      .map((r) => [r.legacySupabaseClientMealFoodId, r]),
  );
  const mealHistoryByLegacy = new Map(
    localMealHistory
      .filter((r) => norm(r.legacySupabaseMealHistoryId))
      .map((r) => [r.legacySupabaseMealHistoryId, r]),
  );
  const mealLogByLegacy = new Map(
    localMealLogs
      .filter((r) => norm(r.legacySupabaseMealLogId))
      .map((r) => [r.legacySupabaseMealLogId, r]),
  );
  const drinkLogByLegacy = new Map(
    localDrinkLogs
      .filter((r) => norm(r.legacySupabaseDrinkLogId))
      .map((r) => [r.legacySupabaseDrinkLogId, r]),
  );

  const dupByTable = Object.fromEntries(
    Object.entries(source).map(([k, rows]) => [k, detectDuplicateIds(rows)]),
  );

  const mapTrainer = (row) => {
    const profileId = norm(getFirst(row, ["trainer_id", "created_by"]));
    const email = normEmail(getFirst(row, ["trainer_email", "created_by_email", "email"]));
    if (profileId && userByLegacy.get(profileId)) {
      const user = userByLegacy.get(profileId);
      return trainerByUserId.get(user.id) ?? null;
    }
    if (email && userByEmail.get(email)) {
      const user = userByEmail.get(email);
      return trainerByUserId.get(user.id) ?? null;
    }
    return null;
  };

  const sourcePlansById = new Map(source.nutrition_plans.map((r) => [norm(r.id), r]));
  const sourceMealsById = new Map(source.nutrition_meals.map((r) => [norm(r.id), r]));
  const sourceFoodsById = new Map(source.foods.map((r) => [norm(r.id), r]));

  const candidates = {
    foods: [],
    recipes: [],
    nutrition_plans: [],
    nutrition_meals: [],
    assigned_nutrition_plans: [],
    client_meal_foods: [],
    meal_history: [],
    meal_logs: [],
    drink_logs: [],
  };

  // 1. foods
  for (let i = 0; i < source.foods.length; i += 1) {
    const row = source.foods[i];
    const sourceId = norm(row.id);
    if (dupByTable.foods.has(sourceId)) {
      report.tables.foods.skippedDuplicate += 1;
      markSkipped(report, "foods", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && foodByLegacy.has(sourceId)) {
      report.tables.foods.skippedExisting += 1;
      markSkipped(report, "foods", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const name = norm(getFirst(row, ["name"]));
    if (!name) {
      markSkipped(report, "foods", "MISSING_REQUIRED_NAME", { sourceId });
      continue;
    }
    const trainer = mapTrainer(row);
    if (norm(getFirst(row, ["trainer_id", "created_by"])) && !trainer) {
      report.relationshipSummary.trainerMappingFailures += 1;
      markSkipped(report, "foods", "TRAINER_NOT_MAPPED", { sourceId });
      continue;
    }
    const data = {
      trainerId: trainer?.id ?? null,
      name,
      caloriesPer100g: toNumOrNull(getFirst(row, ["calories_per_100g", "caloriesPer100g"])),
      proteinPer100g: toNumOrNull(getFirst(row, ["protein_per_100g", "proteinPer100g"])),
      carbsPer100g: toNumOrNull(getFirst(row, ["carbs_per_100g", "carbsPer100g"])),
      fatPer100g: toNumOrNull(getFirst(row, ["fat_per_100g", "fatPer100g"])),
      unit: normalizeNullableString(getFirst(row, ["unit"])),
      legacySupabaseFoodId: sourceId || null,
    };
    candidates.foods.push({ sourceId, data });
    report.tables.foods.importable += 1;
  }

  // 2. recipes
  for (let i = 0; i < source.recipes.length; i += 1) {
    const row = source.recipes[i];
    const sourceId = norm(row.id);
    if (dupByTable.recipes.has(sourceId)) {
      report.tables.recipes.skippedDuplicate += 1;
      markSkipped(report, "recipes", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && recipeByLegacy.has(sourceId)) {
      report.tables.recipes.skippedExisting += 1;
      markSkipped(report, "recipes", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const name = norm(getFirst(row, ["name", "title"]));
    if (!name) {
      markSkipped(report, "recipes", "MISSING_REQUIRED_NAME", { sourceId });
      continue;
    }
    const trainer = mapTrainer(row);
    if (norm(getFirst(row, ["trainer_id", "created_by"])) && !trainer) {
      report.relationshipSummary.trainerMappingFailures += 1;
      markSkipped(report, "recipes", "TRAINER_NOT_MAPPED", { sourceId });
      continue;
    }
    candidates.recipes.push({
      sourceId,
      data: {
        trainerId: trainer?.id ?? null,
        name,
        description: normalizeNullableString(getFirst(row, ["description"])),
        instructions: normalizeNullableString(getFirst(row, ["instructions"])),
        imageUrl: normalizeNullableString(getFirst(row, ["image_url", "imageUrl"])),
        legacySupabaseRecipeId: sourceId || null,
      },
    });
    report.tables.recipes.importable += 1;
  }

  // 3. nutrition plans
  const resolvedPlans = new Map(); // sourceId -> local/planned id token
  for (let i = 0; i < source.nutrition_plans.length; i += 1) {
    const row = source.nutrition_plans[i];
    const sourceId = norm(row.id);
    if (dupByTable.nutrition_plans.has(sourceId)) {
      report.tables.nutrition_plans.skippedDuplicate += 1;
      markSkipped(report, "nutrition_plans", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && planByLegacy.has(sourceId)) {
      report.tables.nutrition_plans.skippedExisting += 1;
      markSkipped(report, "nutrition_plans", "LEGACY_ALREADY_EXISTS", { sourceId });
      resolvedPlans.set(sourceId, planByLegacy.get(sourceId).id);
      continue;
    }
    const trainer = mapTrainer(row);
    if (!trainer) {
      report.relationshipSummary.trainerMappingFailures += 1;
      markSkipped(report, "nutrition_plans", "TRAINER_NOT_MAPPED", { sourceId });
      continue;
    }
    const name = norm(getFirst(row, ["name", "title"]));
    if (!name) {
      markSkipped(report, "nutrition_plans", "MISSING_REQUIRED_NAME", { sourceId });
      continue;
    }
    candidates.nutrition_plans.push({
      sourceId,
      data: {
        trainerId: trainer.id,
        name,
        description: normalizeNullableString(getFirst(row, ["description"])),
        legacySupabaseNutritionPlanId: sourceId || null,
      },
    });
    resolvedPlans.set(sourceId, `planned:${sourceId}`);
    report.tables.nutrition_plans.importable += 1;
  }

  // 4. nutrition meals
  const resolvedMeals = new Map();
  for (let i = 0; i < source.nutrition_meals.length; i += 1) {
    const row = source.nutrition_meals[i];
    const sourceId = norm(row.id);
    if (dupByTable.nutrition_meals.has(sourceId)) {
      report.tables.nutrition_meals.skippedDuplicate += 1;
      markSkipped(report, "nutrition_meals", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && mealByLegacy.has(sourceId)) {
      report.tables.nutrition_meals.skippedExisting += 1;
      markSkipped(report, "nutrition_meals", "LEGACY_ALREADY_EXISTS", { sourceId });
      resolvedMeals.set(sourceId, mealByLegacy.get(sourceId).id);
      continue;
    }
    const name = norm(getFirst(row, ["name", "title"]));
    if (!name) {
      markSkipped(report, "nutrition_meals", "MISSING_REQUIRED_NAME", { sourceId });
      continue;
    }
    const sourcePlanId = norm(getFirst(row, ["plan_id", "nutrition_plan_id"]));
    if (!sourcePlanId || !sourcePlansById.has(sourcePlanId) || !resolvedPlans.has(sourcePlanId)) {
      report.relationshipSummary.planMappingFailures += 1;
      markSkipped(report, "nutrition_meals", "PLAN_NOT_MAPPED", { sourceId, sourcePlanId: sourcePlanId || null });
      continue;
    }
    candidates.nutrition_meals.push({
      sourceId,
      sourcePlanId,
      data: {
        planId: resolvedPlans.get(sourcePlanId),
        name,
        description: normalizeNullableString(getFirst(row, ["description"])),
        sortOrder: Number.isInteger(getFirst(row, ["sort_order"])) ? getFirst(row, ["sort_order"]) : 0,
        legacySupabaseNutritionMealId: sourceId || null,
      },
    });
    resolvedMeals.set(sourceId, `planned:${sourceId}`);
    report.tables.nutrition_meals.importable += 1;
  }

  // 5. assigned nutrition plans
  const assignmentCandidates = [];
  for (let i = 0; i < source.assigned_nutrition_plans.length; i += 1) {
    const row = source.assigned_nutrition_plans[i];
    const sourceId = norm(row.id);
    if (dupByTable.assigned_nutrition_plans.has(sourceId)) {
      report.tables.assigned_nutrition_plans.skippedDuplicate += 1;
      markSkipped(report, "assigned_nutrition_plans", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && assignedByLegacy.has(sourceId)) {
      report.tables.assigned_nutrition_plans.skippedExisting += 1;
      markSkipped(report, "assigned_nutrition_plans", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const sourceClientId = norm(getFirst(row, ["client_id"]));
    const sourcePlanId = norm(getFirst(row, ["plan_id", "nutrition_plan_id"]));
    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      markSkipped(report, "assigned_nutrition_plans", "CLIENT_NOT_MAPPED", { sourceId, sourceClientId });
      continue;
    }
    if (!resolvedPlans.has(sourcePlanId)) {
      report.relationshipSummary.planMappingFailures += 1;
      markSkipped(report, "assigned_nutrition_plans", "PLAN_NOT_MAPPED", { sourceId, sourcePlanId });
      continue;
    }
    assignmentCandidates.push({
      row,
      sourceId,
      sourceIndex: i,
      finalClientId: client.id,
      finalPlanId: resolvedPlans.get(sourcePlanId),
    });
  }

  const assignmentGroups = new Map();
  for (const c of assignmentCandidates) {
    const key = `${c.finalClientId}::${c.finalPlanId}`;
    const arr = assignmentGroups.get(key) ?? [];
    arr.push(c);
    assignmentGroups.set(key, arr);
  }
  for (const [pairKey, group] of assignmentGroups.entries()) {
    const keep = pickNewestAssignment(group.map((g) => g.row));
    const keeper = group.find((g) => g.row === keep) ?? group[0];
    if (group.length > 1) {
      report.relationshipSummary.assignmentFinalPairDuplicatesInSource += 1;
      for (const row of group) {
        if (row.sourceId === keeper.sourceId) continue;
        report.tables.assigned_nutrition_plans.skippedDuplicate += 1;
        markSkipped(report, "assigned_nutrition_plans", "ASSIGNMENT_DUPLICATE_FINAL_PAIR_SKIPPED", {
          sourceId: row.sourceId,
          keptSourceId: keeper.sourceId,
          pairKey,
        });
      }
    }
    if (assignedByPair.has(pairKey)) {
      report.relationshipSummary.assignmentFinalPairAlreadyExistsLocal += 1;
      report.tables.assigned_nutrition_plans.skippedExisting += 1;
      markSkipped(report, "assigned_nutrition_plans", "ASSIGNMENT_FINAL_PAIR_EXISTS_LOCAL", {
        sourceId: keeper.sourceId,
        pairKey,
      });
      continue;
    }
    candidates.assigned_nutrition_plans.push({
      sourceId: keeper.sourceId,
      finalClientId: keeper.finalClientId,
      finalPlanId: keeper.finalPlanId,
      assignedAt: toIso(getFirst(keeper.row, ["assigned_at", "created_at"])),
      active: getFirst(keeper.row, ["active"]) === false ? false : true,
    });
    report.tables.assigned_nutrition_plans.importable += 1;
  }

  // 6. client meal foods
  for (let i = 0; i < source.client_meal_foods.length; i += 1) {
    const row = source.client_meal_foods[i];
    const sourceId = norm(row.id);
    if (dupByTable.client_meal_foods.has(sourceId)) {
      report.tables.client_meal_foods.skippedDuplicate += 1;
      markSkipped(report, "client_meal_foods", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && clientMealFoodByLegacy.has(sourceId)) {
      report.tables.client_meal_foods.skippedExisting += 1;
      markSkipped(report, "client_meal_foods", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const sourceClientId = norm(getFirst(row, ["client_id"]));
    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      markSkipped(report, "client_meal_foods", "CLIENT_NOT_MAPPED", { sourceId, sourceClientId });
      continue;
    }
    const sourceMealId = norm(getFirst(row, ["meal_id", "nutrition_meal_id"]));
    const sourceFoodId = norm(getFirst(row, ["food_id"]));
    if (sourceMealId && !resolvedMeals.has(sourceMealId) && !mealByLegacy.has(sourceMealId)) {
      report.relationshipSummary.mealMappingFailures += 1;
      markSkipped(report, "client_meal_foods", "MEAL_NOT_MAPPED", { sourceId, sourceMealId });
      continue;
    }
    if (sourceFoodId && !foodByLegacy.has(sourceFoodId) && !sourceFoodsById.has(sourceFoodId)) {
      report.relationshipSummary.foodMappingFailures += 1;
      markSkipped(report, "client_meal_foods", "FOOD_NOT_MAPPED", { sourceId, sourceFoodId });
      continue;
    }
    candidates.client_meal_foods.push({
      sourceId,
      data: {
        clientId: client.id,
        mealId: sourceMealId ? mealByLegacy.get(sourceMealId)?.id ?? resolvedMeals.get(sourceMealId) : null,
        foodId: sourceFoodId ? foodByLegacy.get(sourceFoodId)?.id ?? `planned:${sourceFoodId}` : null,
        category: normalizeNullableString(getFirst(row, ["category"])),
        amountG: toNumOrNull(getFirst(row, ["amount_g", "amount"])),
        legacySupabaseClientMealFoodId: sourceId || null,
      },
    });
    report.tables.client_meal_foods.importable += 1;
  }

  // 7. meal history
  for (let i = 0; i < source.meal_history.length; i += 1) {
    const row = source.meal_history[i];
    const sourceId = norm(row.id);
    if (dupByTable.meal_history.has(sourceId)) {
      report.tables.meal_history.skippedDuplicate += 1;
      markSkipped(report, "meal_history", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && mealHistoryByLegacy.has(sourceId)) {
      report.tables.meal_history.skippedExisting += 1;
      markSkipped(report, "meal_history", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const sourceClientId = norm(getFirst(row, ["client_id"]));
    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      markSkipped(report, "meal_history", "CLIENT_NOT_MAPPED", { sourceId, sourceClientId });
      continue;
    }
    candidates.meal_history.push({
      sourceId,
      data: {
        clientId: client.id,
        name: normalizeNullableString(getFirst(row, ["name"])),
        category: normalizeNullableString(getFirst(row, ["category"])),
        amountG: toNumOrNull(getFirst(row, ["amount_g", "amount"])),
        calories: toNumOrNull(getFirst(row, ["calories"])),
        protein: toNumOrNull(getFirst(row, ["protein"])),
        carbs: toNumOrNull(getFirst(row, ["carbs"])),
        fat: toNumOrNull(getFirst(row, ["fat"])),
        loggedAt: toIso(getFirst(row, ["logged_at", "created_at"])) ?? new Date().toISOString(),
        legacySupabaseMealHistoryId: sourceId || null,
      },
    });
    report.tables.meal_history.importable += 1;
  }

  // 8. meal logs
  for (let i = 0; i < source.meal_logs.length; i += 1) {
    const row = source.meal_logs[i];
    const sourceId = norm(row.id);
    if (dupByTable.meal_logs.has(sourceId)) {
      report.tables.meal_logs.skippedDuplicate += 1;
      markSkipped(report, "meal_logs", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && mealLogByLegacy.has(sourceId)) {
      report.tables.meal_logs.skippedExisting += 1;
      markSkipped(report, "meal_logs", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const sourceClientId = norm(getFirst(row, ["client_id"]));
    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      markSkipped(report, "meal_logs", "CLIENT_NOT_MAPPED", { sourceId, sourceClientId });
      continue;
    }
    const date = norm(getFirst(row, ["date"]));
    if (!date) {
      markSkipped(report, "meal_logs", "MISSING_REQUIRED_DATE", { sourceId });
      continue;
    }
    candidates.meal_logs.push({
      sourceId,
      data: {
        clientId: client.id,
        date,
        mealType: normalizeNullableString(getFirst(row, ["meal_type", "mealType"])),
        notes: normalizeNullableString(getFirst(row, ["notes"])),
        legacySupabaseMealLogId: sourceId || null,
      },
    });
    report.tables.meal_logs.importable += 1;
  }

  // 9. drink logs
  for (let i = 0; i < source.drink_logs.length; i += 1) {
    const row = source.drink_logs[i];
    const sourceId = norm(row.id);
    if (dupByTable.drink_logs.has(sourceId)) {
      report.tables.drink_logs.skippedDuplicate += 1;
      markSkipped(report, "drink_logs", "DUPLICATE_SOURCE_ID", { sourceId, sourceIndex: i });
      continue;
    }
    if (sourceId && drinkLogByLegacy.has(sourceId)) {
      report.tables.drink_logs.skippedExisting += 1;
      markSkipped(report, "drink_logs", "LEGACY_ALREADY_EXISTS", { sourceId });
      continue;
    }
    const sourceClientId = norm(getFirst(row, ["client_id"]));
    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      markSkipped(report, "drink_logs", "CLIENT_NOT_MAPPED", { sourceId, sourceClientId });
      continue;
    }
    candidates.drink_logs.push({
      sourceId,
      data: {
        clientId: client.id,
        drinkType: normalizeNullableString(getFirst(row, ["drink_type", "drinkType"])),
        amountMl: toNumOrNull(getFirst(row, ["amount_ml", "amountMl"])),
        loggedAt: toIso(getFirst(row, ["logged_at", "created_at"])) ?? new Date().toISOString(),
        legacySupabaseDrinkLogId: sourceId || null,
      },
    });
    report.tables.drink_logs.importable += 1;
  }

  for (const key of Object.keys(report.tables)) {
    report.summary.totalImportable += report.tables[key].importable;
    report.summary.totalSkipped += report.tables[key].skipped;
  }

  if (apply) {
    try {
      await prisma.$transaction(async (tx) => {
        const plannedFoodIdByLegacy = new Map();
        const plannedPlanIdByLegacy = new Map();
        const plannedMealIdByLegacy = new Map();

        for (const c of candidates.foods) {
          const created = await tx.food.create({ data: c.data, select: { id: true } });
          plannedFoodIdByLegacy.set(c.sourceId, created.id);
          report.tables.foods.created += 1;
        }
        for (const c of candidates.recipes) {
          await tx.recipe.create({ data: c.data });
          report.tables.recipes.created += 1;
        }
        for (const c of candidates.nutrition_plans) {
          const created = await tx.nutritionPlan.create({ data: c.data, select: { id: true } });
          plannedPlanIdByLegacy.set(c.sourceId, created.id);
          report.tables.nutrition_plans.created += 1;
        }
        for (const c of candidates.nutrition_meals) {
          const planId = c.data.planId.startsWith("planned:")
            ? plannedPlanIdByLegacy.get(c.sourcePlanId)
            : c.data.planId;
          if (!planId) throw new Error(`Missing resolved planId for nutrition meal ${c.sourceId}`);
          const created = await tx.nutritionMeal.create({
            data: { ...c.data, planId },
            select: { id: true },
          });
          plannedMealIdByLegacy.set(c.sourceId, created.id);
          report.tables.nutrition_meals.created += 1;
        }

        for (const c of candidates.assigned_nutrition_plans) {
          const planId = c.finalPlanId.startsWith("planned:")
            ? plannedPlanIdByLegacy.get(c.finalPlanId.replace("planned:", ""))
            : c.finalPlanId;
          if (!planId) throw new Error(`Missing resolved planId for assignment ${c.sourceId}`);

          const existingPair = await tx.assignedNutritionPlan.findFirst({
            where: { clientId: c.finalClientId, planId },
            select: { id: true },
          });
          if (existingPair) {
            await tx.assignedNutritionPlan.update({
              where: { id: existingPair.id },
              data: { active: true, assignedAt: c.assignedAt ? new Date(c.assignedAt) : new Date() },
            });
            report.tables.assigned_nutrition_plans.skippedExisting += 1;
            report.tables.assigned_nutrition_plans.skipped += 1;
            report.tables.assigned_nutrition_plans.skippedByReason.REACTIVATED_EXISTING_PAIR =
              (report.tables.assigned_nutrition_plans.skippedByReason.REACTIVATED_EXISTING_PAIR ?? 0) + 1;
            continue;
          }
          await tx.assignedNutritionPlan.create({
            data: {
              clientId: c.finalClientId,
              planId,
              active: c.active,
              assignedAt: c.assignedAt ? new Date(c.assignedAt) : new Date(),
              legacySupabaseAssignedNutritionPlanId: c.sourceId || null,
            },
          });
          report.tables.assigned_nutrition_plans.created += 1;
        }

        for (const c of candidates.client_meal_foods) {
          const foodId =
            c.data.foodId && c.data.foodId.startsWith("planned:")
              ? plannedFoodIdByLegacy.get(c.data.foodId.replace("planned:", ""))
              : c.data.foodId;
          const mealId =
            c.data.mealId && c.data.mealId.startsWith("planned:")
              ? plannedMealIdByLegacy.get(c.data.mealId.replace("planned:", ""))
              : c.data.mealId;
          await tx.clientMealFood.create({
            data: { ...c.data, foodId: foodId ?? null, mealId: mealId ?? null },
          });
          report.tables.client_meal_foods.created += 1;
        }
        for (const c of candidates.meal_history) {
          await tx.mealHistory.create({ data: { ...c.data, loggedAt: new Date(c.data.loggedAt) } });
          report.tables.meal_history.created += 1;
        }
        for (const c of candidates.meal_logs) {
          await tx.mealLog.create({ data: c.data });
          report.tables.meal_logs.created += 1;
        }
        for (const c of candidates.drink_logs) {
          await tx.drinkLog.create({ data: { ...c.data, loggedAt: new Date(c.data.loggedAt) } });
          report.tables.drink_logs.created += 1;
        }
      });
    } catch (error) {
      await prisma.$disconnect();
      console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
  }

  await prisma.$disconnect();

  for (const key of Object.keys(report.tables)) {
    report.summary.totalCreated += report.tables[key].created;
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Supabase Nutrition Import ===");
  console.log(`mode: ${mode}`);
  console.log(`backupFolder: ${report.backupFolder}`);
  console.log("--- source totals ---");
  for (const [k, v] of Object.entries(report.sourceTotals)) console.log(`${k}: ${v}`);
  console.log("--- created counts ---");
  for (const [k, v] of Object.entries(report.tables)) console.log(`${k}: ${v.created}`);
  console.log("--- skipped existing / duplicate ---");
  for (const [k, v] of Object.entries(report.tables)) {
    console.log(`${k}: existing=${v.skippedExisting}, duplicate=${v.skippedDuplicate}, skippedTotal=${v.skipped}`);
  }
  console.log("--- conflicts by reason ---");
  for (const [k, v] of Object.entries(report.conflictCounts)) console.log(`${k}: ${v}`);
  console.log("--- relationship mapping summary ---");
  for (const [k, v] of Object.entries(report.relationshipSummary)) console.log(`${k}: ${v}`);
  console.log(`report path: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((error) => {
  console.error(`Import script failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
