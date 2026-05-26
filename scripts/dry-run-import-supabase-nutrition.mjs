import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function usage() {
  console.log(
    "Usage: node scripts/dry-run-import-supabase-nutrition.mjs backups/supabase/<YYYY-MM-DD-HH-mm>",
  );
}

async function loadJsonArray(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} must be a JSON array`);
  }
  return parsed;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value) {
  const v = normalizeString(value);
  return v.length > 0 ? v : null;
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toDateOrNull(value) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function getFirst(row, keys) {
  for (const key of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }
  return undefined;
}

function pushConflict(report, code, details) {
  report.conflicts.push({ code, ...details });
  report.conflictCounts[code] = (report.conflictCounts[code] ?? 0) + 1;
}

function incSkipped(report, table, code, details) {
  report.tables[table].skipped += 1;
  report.tables[table].skippedByReason[code] =
    (report.tables[table].skippedByReason[code] ?? 0) + 1;
  pushConflict(report, code, { table, ...details });
}

function incImportable(report, table) {
  report.tables[table].importable += 1;
}

function detectDuplicatesById(rows, sourceIdKeys) {
  const seen = new Map();
  const duplicates = [];
  for (let i = 0; i < rows.length; i += 1) {
    const sourceId = normalizeString(getFirst(rows[i], sourceIdKeys));
    if (!sourceId) continue;
    if (!seen.has(sourceId)) {
      seen.set(sourceId, i);
      continue;
    }
    duplicates.push({
      sourceId,
      firstIndex: seen.get(sourceId),
      duplicateIndex: i,
    });
  }
  return duplicates;
}

async function detectNutritionFiles(backupFolder) {
  const manifestPath = path.join(backupFolder, "manifest.json");
  let manifestTables = [];
  try {
    const manifestRaw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);
    manifestTables = Array.isArray(manifest?.tables) ? manifest.tables : [];
  } catch {
    manifestTables = [];
  }

  const expected = {
    foods: ["foods.json"],
    recipes: ["recipes.json"],
    nutrition_plans: ["nutrition_plans.json"],
    nutrition_meals: ["nutrition_meals.json"],
    assigned_nutrition_plans: ["assigned_nutrition_plans.json"],
    client_meal_foods: ["client_meal_foods.json"],
    meal_history: ["meal_history.json"],
    meal_logs: ["meal_logs.json"],
    drink_logs: ["drink_logs.json"],
  };

  const resolved = {};
  for (const [table, preferredFiles] of Object.entries(expected)) {
    let fileName = null;
    const manifestEntry = manifestTables.find(
      (entry) =>
        normalizeString(entry?.table).toLowerCase() === table &&
        normalizeString(entry?.file).length > 0,
    );
    if (manifestEntry) {
      fileName = normalizeString(manifestEntry.file);
    } else {
      for (const candidate of preferredFiles) {
        try {
          await readFile(path.join(backupFolder, candidate), "utf8");
          fileName = candidate;
          break;
        } catch {
          // continue
        }
      }
    }
    if (!fileName) {
      throw new Error(`Missing required backup file for table "${table}"`);
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

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const reportPath = path.join(backupFolder, "dry-run-nutrition-report.json");

  let fileMap;
  try {
    fileMap = await detectNutritionFiles(backupFolder);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const tableRows = {};
  try {
    for (const [table, fileName] of Object.entries(fileMap)) {
      tableRows[table] = await loadJsonArray(path.join(backupFolder, fileName));
    }
  } catch (error) {
    console.error(`Failed to read backup JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    backupFolder: path.relative(process.cwd(), backupFolder),
    inputFiles: fileMap,
    sourceTotals: Object.fromEntries(
      Object.entries(tableRows).map(([table, rows]) => [table, rows.length]),
    ),
    tables: {
      foods: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      recipes: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      nutrition_plans: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      nutrition_meals: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      assigned_nutrition_plans: {
        importable: 0,
        skipped: 0,
        existingByLegacy: 0,
        skippedByReason: {},
      },
      client_meal_foods: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      meal_history: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      meal_logs: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
      drink_logs: { importable: 0, skipped: 0, existingByLegacy: 0, skippedByReason: {} },
    },
    duplicates: {},
    relationshipSummary: {
      trainerMappingFailures: 0,
      clientMappingFailures: 0,
      planMappingFailures: 0,
      mealMappingFailures: 0,
      foodMappingFailures: 0,
      assignmentFinalPairDuplicatesInSource: 0,
      assignmentFinalPairAlreadyExistsLocal: 0,
      assignmentLegacyAlreadyExists: 0,
    },
    unknownFieldReport: {},
    imageUrlCounts: {
      foodsPresent: 0,
      foodsMissing: 0,
      recipesPresent: 0,
      recipesMissing: 0,
    },
    conflictCounts: {},
    conflicts: [],
    summary: {
      totalImportable: 0,
      totalSkipped: 0,
    },
  };

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  async function safeFindMany(label, fn) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist in the current database")) {
        pushConflict(report, "LOCAL_TABLE_MISSING", { table: label, message });
        return [];
      }
      throw error;
    }
  }

  let trainerProfiles = [];
  let clientProfiles = [];
  let users = [];
  let localFoods = [];
  let localRecipes = [];
  let localPlans = [];
  let localMeals = [];
  let localAssignments = [];
  let localClientMealFoods = [];
  let localMealHistory = [];
  let localMealLogs = [];
  let localDrinkLogs = [];

  try {
    [
      trainerProfiles,
      clientProfiles,
      users,
      localFoods,
      localRecipes,
      localPlans,
      localMeals,
      localAssignments,
      localClientMealFoods,
      localMealHistory,
      localMealLogs,
      localDrinkLogs,
    ] = await Promise.all([
      safeFindMany("TrainerProfile", () => prisma.trainerProfile.findMany({
        select: { id: true, userId: true },
      })),
      safeFindMany("ClientProfile", () => prisma.clientProfile.findMany({
        select: { id: true, trainerId: true, userId: true, legacySupabaseClientId: true },
      })),
      safeFindMany("User", () => prisma.user.findMany({
        select: { id: true, legacySupabaseProfileId: true, email: true },
      })),
      safeFindMany("Food", () => prisma.food.findMany({
        select: { id: true, trainerId: true, legacySupabaseFoodId: true, name: true },
      })),
      safeFindMany("Recipe", () => prisma.recipe.findMany({
        select: { id: true, trainerId: true, legacySupabaseRecipeId: true, name: true },
      })),
      safeFindMany("NutritionPlan", () => prisma.nutritionPlan.findMany({
        select: { id: true, trainerId: true, legacySupabaseNutritionPlanId: true, name: true },
      })),
      safeFindMany("NutritionMeal", () => prisma.nutritionMeal.findMany({
        select: { id: true, planId: true, legacySupabaseNutritionMealId: true, name: true },
      })),
      safeFindMany("AssignedNutritionPlan", () => prisma.assignedNutritionPlan.findMany({
        select: {
          id: true,
          clientId: true,
          planId: true,
          active: true,
          legacySupabaseAssignedNutritionPlanId: true,
        },
      })),
      safeFindMany("ClientMealFood", () => prisma.clientMealFood.findMany({
        select: {
          id: true,
          clientId: true,
          mealId: true,
          foodId: true,
          legacySupabaseClientMealFoodId: true,
        },
      })),
      safeFindMany("MealHistory", () => prisma.mealHistory.findMany({
        select: { id: true, clientId: true, legacySupabaseMealHistoryId: true },
      })),
      safeFindMany("MealLog", () => prisma.mealLog.findMany({
        select: { id: true, clientId: true, legacySupabaseMealLogId: true },
      })),
      safeFindMany("DrinkLog", () => prisma.drinkLog.findMany({
        select: { id: true, clientId: true, legacySupabaseDrinkLogId: true },
      })),
    ]);
  } catch (error) {
    await prisma.$disconnect();
    console.error(`Failed Prisma lookup for dry-run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  await prisma.$disconnect();

  const userByLegacyProfileId = new Map(
    users
      .filter((u) => normalizeString(u.legacySupabaseProfileId).length > 0)
      .map((u) => [u.legacySupabaseProfileId, u]),
  );
  const userByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  const trainerByUserId = new Map(trainerProfiles.map((t) => [t.userId, t]));
  const clientByLegacyClientId = new Map(
    clientProfiles
      .filter((c) => normalizeString(c.legacySupabaseClientId).length > 0)
      .map((c) => [c.legacySupabaseClientId, c]),
  );
  const localFoodByLegacy = new Map(
    localFoods
      .filter((f) => normalizeString(f.legacySupabaseFoodId).length > 0)
      .map((f) => [f.legacySupabaseFoodId, f]),
  );
  const localRecipeByLegacy = new Map(
    localRecipes
      .filter((r) => normalizeString(r.legacySupabaseRecipeId).length > 0)
      .map((r) => [r.legacySupabaseRecipeId, r]),
  );
  const localPlanByLegacy = new Map(
    localPlans
      .filter((p) => normalizeString(p.legacySupabaseNutritionPlanId).length > 0)
      .map((p) => [p.legacySupabaseNutritionPlanId, p]),
  );
  const localMealByLegacy = new Map(
    localMeals
      .filter((m) => normalizeString(m.legacySupabaseNutritionMealId).length > 0)
      .map((m) => [m.legacySupabaseNutritionMealId, m]),
  );
  const localAssignmentByLegacy = new Map(
    localAssignments
      .filter((a) => normalizeString(a.legacySupabaseAssignedNutritionPlanId).length > 0)
      .map((a) => [a.legacySupabaseAssignedNutritionPlanId, a]),
  );
  const localAssignmentFinalPair = new Map(
    localAssignments.map((a) => [`${a.clientId}::${a.planId}`, a]),
  );
  const localClientMealFoodByLegacy = new Map(
    localClientMealFoods
      .filter((c) => normalizeString(c.legacySupabaseClientMealFoodId).length > 0)
      .map((c) => [c.legacySupabaseClientMealFoodId, c]),
  );
  const localMealHistoryByLegacy = new Map(
    localMealHistory
      .filter((m) => normalizeString(m.legacySupabaseMealHistoryId).length > 0)
      .map((m) => [m.legacySupabaseMealHistoryId, m]),
  );
  const localMealLogByLegacy = new Map(
    localMealLogs
      .filter((m) => normalizeString(m.legacySupabaseMealLogId).length > 0)
      .map((m) => [m.legacySupabaseMealLogId, m]),
  );
  const localDrinkLogByLegacy = new Map(
    localDrinkLogs
      .filter((d) => normalizeString(d.legacySupabaseDrinkLogId).length > 0)
      .map((d) => [d.legacySupabaseDrinkLogId, d]),
  );

  const sourceRows = tableRows;

  // duplicate source ID checks
  const idKeyMap = {
    foods: ["id"],
    recipes: ["id"],
    nutrition_plans: ["id"],
    nutrition_meals: ["id"],
    assigned_nutrition_plans: ["id"],
    client_meal_foods: ["id"],
    meal_history: ["id"],
    meal_logs: ["id"],
    drink_logs: ["id"],
  };
  for (const table of Object.keys(sourceRows)) {
    report.duplicates[table] = detectDuplicatesById(sourceRows[table], idKeyMap[table]);
    for (const dup of report.duplicates[table]) {
      incSkipped(report, table, "DUPLICATE_SOURCE_ID", dup);
    }
  }

  // Build cached source maps
  const sourceFoodById = new Map(sourceRows.foods.map((r) => [normalizeString(r.id), r]));
  const sourcePlanById = new Map(sourceRows.nutrition_plans.map((r) => [normalizeString(r.id), r]));
  const sourceMealById = new Map(sourceRows.nutrition_meals.map((r) => [normalizeString(r.id), r]));

  // Trainer mapping helper via profile UUID (legacy user profile id) or email fallback
  function mapTrainerBySupabaseProfile(profileId, email) {
    const pId = normalizeString(profileId);
    if (pId.length > 0) {
      const user = userByLegacyProfileId.get(pId);
      if (user) {
        const trainer = trainerByUserId.get(user.id);
        if (trainer) return trainer;
      }
    }
    const e = normalizeEmail(email);
    if (e.length > 0) {
      const user = userByEmail.get(e);
      if (user) {
        const trainer = trainerByUserId.get(user.id);
        if (trainer) return trainer;
      }
    }
    return null;
  }

  // FOODS
  for (let i = 0; i < sourceRows.foods.length; i += 1) {
    const row = sourceRows.foods[i];
    const sourceId = normalizeString(row.id);
    const name = normalizeString(getFirst(row, ["name"]));
    const trainerProfileId = normalizeString(getFirst(row, ["created_by", "trainer_id"]));
    const trainerEmail = normalizeEmail(getFirst(row, ["trainer_email", "created_by_email", "email"]));
    const imageUrl = normalizeNullableString(getFirst(row, ["image_url", "imageUrl"]));
    if (imageUrl) report.imageUrlCounts.foodsPresent += 1;
    else report.imageUrlCounts.foodsMissing += 1;

    if (!name) {
      incSkipped(report, "foods", "FOOD_MISSING_NAME", { sourceId, sourceIndex: i });
      continue;
    }

    const trainer = mapTrainerBySupabaseProfile(trainerProfileId, trainerEmail);
    if (trainerProfileId && !trainer) {
      report.relationshipSummary.trainerMappingFailures += 1;
      incSkipped(report, "foods", "FOOD_TRAINER_NOT_MAPPED", {
        sourceId,
        trainerProfileId,
        trainerEmail: trainerEmail || null,
      });
      continue;
    }

    if (sourceId && localFoodByLegacy.has(sourceId)) {
      report.tables.foods.existingByLegacy += 1;
      incSkipped(report, "foods", "FOOD_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: localFoodByLegacy.get(sourceId).id,
      });
      continue;
    }

    // Conservative unknown field report
    const known = new Set([
      "id",
      "name",
      "calories_per_100g",
      "protein_per_100g",
      "carbs_per_100g",
      "fat_per_100g",
      "unit",
      "created_by",
      "trainer_id",
      "image_url",
      "created_at",
      "updated_at",
    ]);
    for (const key of Object.keys(row)) {
      if (!known.has(key)) {
        report.unknownFieldReport.foods = report.unknownFieldReport.foods ?? {};
        report.unknownFieldReport.foods[key] = (report.unknownFieldReport.foods[key] ?? 0) + 1;
      }
    }

    incImportable(report, "foods");
  }

  // RECIPES
  for (let i = 0; i < sourceRows.recipes.length; i += 1) {
    const row = sourceRows.recipes[i];
    const sourceId = normalizeString(row.id);
    const name = normalizeString(getFirst(row, ["name", "title"]));
    const trainerProfileId = normalizeString(getFirst(row, ["created_by", "trainer_id"]));
    const trainerEmail = normalizeEmail(getFirst(row, ["trainer_email", "created_by_email", "email"]));
    const imageUrl = normalizeNullableString(getFirst(row, ["image_url", "imageUrl"]));
    if (imageUrl) report.imageUrlCounts.recipesPresent += 1;
    else report.imageUrlCounts.recipesMissing += 1;

    if (!name) {
      incSkipped(report, "recipes", "RECIPE_MISSING_NAME", { sourceId, sourceIndex: i });
      continue;
    }
    const trainer = mapTrainerBySupabaseProfile(trainerProfileId, trainerEmail);
    if (trainerProfileId && !trainer) {
      report.relationshipSummary.trainerMappingFailures += 1;
      incSkipped(report, "recipes", "RECIPE_TRAINER_NOT_MAPPED", {
        sourceId,
        trainerProfileId,
        trainerEmail: trainerEmail || null,
      });
      continue;
    }
    if (sourceId && localRecipeByLegacy.has(sourceId)) {
      report.tables.recipes.existingByLegacy += 1;
      incSkipped(report, "recipes", "RECIPE_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: localRecipeByLegacy.get(sourceId).id,
      });
      continue;
    }
    incImportable(report, "recipes");
  }

  // NUTRITION PLANS
  const importablePlans = new Map(); // sourcePlanId -> local/resolved info
  for (let i = 0; i < sourceRows.nutrition_plans.length; i += 1) {
    const row = sourceRows.nutrition_plans[i];
    const sourceId = normalizeString(row.id);
    const name = normalizeString(getFirst(row, ["name", "title"]));
    const trainerProfileId = normalizeString(getFirst(row, ["trainer_id", "created_by"]));
    const trainerEmail = normalizeEmail(getFirst(row, ["trainer_email", "created_by_email", "email"]));

    if (!name) {
      incSkipped(report, "nutrition_plans", "NUTRITION_PLAN_MISSING_NAME", { sourceId, sourceIndex: i });
      continue;
    }
    const trainer = mapTrainerBySupabaseProfile(trainerProfileId, trainerEmail);
    if (!trainer) {
      report.relationshipSummary.trainerMappingFailures += 1;
      incSkipped(report, "nutrition_plans", "NUTRITION_PLAN_TRAINER_NOT_MAPPED", {
        sourceId,
        trainerProfileId: trainerProfileId || null,
        trainerEmail: trainerEmail || null,
      });
      continue;
    }
    const existing = sourceId ? localPlanByLegacy.get(sourceId) : null;
    if (existing) {
      report.tables.nutrition_plans.existingByLegacy += 1;
      incSkipped(report, "nutrition_plans", "NUTRITION_PLAN_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: existing.id,
      });
    } else {
      incImportable(report, "nutrition_plans");
    }
    importablePlans.set(sourceId, {
      sourceId,
      trainerId: trainer.id,
      localPlanId: existing?.id ?? `(planned:${sourceId})`,
      existing: Boolean(existing),
    });
  }

  // NUTRITION MEALS
  const importableMeals = new Map(); // sourceMealId -> local/resolved info
  for (let i = 0; i < sourceRows.nutrition_meals.length; i += 1) {
    const row = sourceRows.nutrition_meals[i];
    const sourceId = normalizeString(row.id);
    const name = normalizeString(getFirst(row, ["name", "title"]));
    const planId = normalizeString(getFirst(row, ["plan_id", "nutrition_plan_id"]));
    if (!name) {
      incSkipped(report, "nutrition_meals", "NUTRITION_MEAL_MISSING_NAME", { sourceId, sourceIndex: i });
      continue;
    }
    if (!planId || !sourcePlanById.has(planId)) {
      report.relationshipSummary.planMappingFailures += 1;
      incSkipped(report, "nutrition_meals", "NUTRITION_MEAL_SOURCE_PLAN_NOT_FOUND", {
        sourceId,
        sourcePlanId: planId || null,
      });
      continue;
    }
    const mappedPlan = importablePlans.get(planId);
    if (!mappedPlan) {
      report.relationshipSummary.planMappingFailures += 1;
      incSkipped(report, "nutrition_meals", "NUTRITION_MEAL_PLAN_NOT_IMPORTABLE", {
        sourceId,
        sourcePlanId: planId,
      });
      continue;
    }
    const existing = sourceId ? localMealByLegacy.get(sourceId) : null;
    if (existing) {
      report.tables.nutrition_meals.existingByLegacy += 1;
      incSkipped(report, "nutrition_meals", "NUTRITION_MEAL_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: existing.id,
      });
    } else {
      incImportable(report, "nutrition_meals");
    }
    importableMeals.set(sourceId, {
      sourceId,
      planId: mappedPlan.localPlanId,
      existing: Boolean(existing),
      localMealId: existing?.id ?? `(planned:${sourceId})`,
    });
  }

  // ASSIGNED NUTRITION PLANS (with final-pair duplicate detection)
  const assignmentCandidates = [];
  for (let i = 0; i < sourceRows.assigned_nutrition_plans.length; i += 1) {
    const row = sourceRows.assigned_nutrition_plans[i];
    const sourceId = normalizeString(row.id);
    const sourceClientId = normalizeString(getFirst(row, ["client_id"]));
    const sourcePlanId = normalizeString(getFirst(row, ["plan_id", "nutrition_plan_id"]));

    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      incSkipped(report, "assigned_nutrition_plans", "ASSIGNED_NUTRITION_CLIENT_NOT_MAPPED", {
        sourceId,
        sourceClientId: sourceClientId || null,
      });
      continue;
    }
    const mappedPlan = importablePlans.get(sourcePlanId);
    if (!mappedPlan) {
      report.relationshipSummary.planMappingFailures += 1;
      incSkipped(report, "assigned_nutrition_plans", "ASSIGNED_NUTRITION_PLAN_NOT_IMPORTABLE", {
        sourceId,
        sourcePlanId: sourcePlanId || null,
      });
      continue;
    }

    const existingLegacy = sourceId ? localAssignmentByLegacy.get(sourceId) : null;
    if (existingLegacy) {
      report.relationshipSummary.assignmentLegacyAlreadyExists += 1;
      report.tables.assigned_nutrition_plans.existingByLegacy += 1;
      incSkipped(report, "assigned_nutrition_plans", "ASSIGNED_NUTRITION_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: existingLegacy.id,
      });
      continue;
    }

    assignmentCandidates.push({
      sourceId,
      sourceIndex: i,
      sourceAssignedAt: toDateOrNull(getFirst(row, ["assigned_at", "created_at"])),
      finalClientId: client.id,
      finalPlanId: mappedPlan.localPlanId,
    });
  }

  const assignmentGroups = new Map();
  for (const candidate of assignmentCandidates) {
    const key = `${candidate.finalClientId}::${candidate.finalPlanId}`;
    const group = assignmentGroups.get(key) ?? [];
    group.push(candidate);
    assignmentGroups.set(key, group);
  }

  for (const [pairKey, group] of assignmentGroups.entries()) {
    let keeper = group[0];
    for (let i = 1; i < group.length; i += 1) {
      const c = group[i];
      if (c.sourceAssignedAt && !keeper.sourceAssignedAt) {
        keeper = c;
      } else if (c.sourceAssignedAt && keeper.sourceAssignedAt && c.sourceAssignedAt > keeper.sourceAssignedAt) {
        keeper = c;
      }
    }

    if (group.length > 1) {
      report.relationshipSummary.assignmentFinalPairDuplicatesInSource += 1;
      for (const row of group) {
        if (row.sourceId === keeper.sourceId) continue;
        incSkipped(
          report,
          "assigned_nutrition_plans",
          "ASSIGNED_NUTRITION_SOURCE_DUPLICATE_FINAL_PAIR_SKIPPED",
          {
            sourceId: row.sourceId,
            keptSourceId: keeper.sourceId,
            finalPairKey: pairKey,
          },
        );
      }
    }

    const localExistingPair = localAssignmentFinalPair.get(pairKey);
    if (localExistingPair) {
      report.relationshipSummary.assignmentFinalPairAlreadyExistsLocal += 1;
      incSkipped(report, "assigned_nutrition_plans", "ASSIGNED_NUTRITION_FINAL_PAIR_ALREADY_EXISTS_LOCAL", {
        sourceId: keeper.sourceId,
        finalPairKey: pairKey,
        existingId: localExistingPair.id,
      });
      continue;
    }

    incImportable(report, "assigned_nutrition_plans");
  }

  // CLIENT MEAL FOODS
  for (let i = 0; i < sourceRows.client_meal_foods.length; i += 1) {
    const row = sourceRows.client_meal_foods[i];
    const sourceId = normalizeString(row.id);
    const sourceClientId = normalizeString(getFirst(row, ["client_id"]));
    const sourceFoodId = normalizeString(getFirst(row, ["food_id"]));
    const sourceMealId = normalizeString(getFirst(row, ["meal_id", "nutrition_meal_id"]));
    const amount = toNumberOrNull(getFirst(row, ["amount_g", "amount"]));
    if (amount === null && getFirst(row, ["amount_g", "amount"]) !== null && getFirst(row, ["amount_g", "amount"]) !== undefined && getFirst(row, ["amount_g", "amount"]) !== "") {
      incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_INVALID_AMOUNT", {
        sourceId,
        sourceIndex: i,
      });
      continue;
    }

    if (sourceId && localClientMealFoodByLegacy.has(sourceId)) {
      report.tables.client_meal_foods.existingByLegacy += 1;
      incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: localClientMealFoodByLegacy.get(sourceId).id,
      });
      continue;
    }

    const client = clientByLegacyClientId.get(sourceClientId);
    if (!client) {
      report.relationshipSummary.clientMappingFailures += 1;
      incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_CLIENT_NOT_MAPPED", {
        sourceId,
        sourceClientId: sourceClientId || null,
      });
      continue;
    }

    if (sourceMealId) {
      if (!sourceMealById.has(sourceMealId)) {
        report.relationshipSummary.mealMappingFailures += 1;
        incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_SOURCE_MEAL_NOT_FOUND", {
          sourceId,
          sourceMealId,
        });
        continue;
      }
      if (!importableMeals.has(sourceMealId) && !localMealByLegacy.has(sourceMealId)) {
        report.relationshipSummary.mealMappingFailures += 1;
        incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_MEAL_NOT_IMPORTABLE", {
          sourceId,
          sourceMealId,
        });
        continue;
      }
    }

    if (sourceFoodId) {
      if (!sourceFoodById.has(sourceFoodId)) {
        report.relationshipSummary.foodMappingFailures += 1;
        incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_SOURCE_FOOD_NOT_FOUND", {
          sourceId,
          sourceFoodId,
        });
        continue;
      }
      if (!localFoodByLegacy.has(sourceFoodId)) {
        // In dry-run this is still importable if food is planned in same run.
        const foodRow = sourceFoodById.get(sourceFoodId);
        const foodName = normalizeString(getFirst(foodRow, ["name"]));
        if (!foodName) {
          report.relationshipSummary.foodMappingFailures += 1;
          incSkipped(report, "client_meal_foods", "CLIENT_MEAL_FOOD_FOOD_NOT_IMPORTABLE", {
            sourceId,
            sourceFoodId,
          });
          continue;
        }
      }
    }

    incImportable(report, "client_meal_foods");
  }

  // MEAL HISTORY
  for (let i = 0; i < sourceRows.meal_history.length; i += 1) {
    const row = sourceRows.meal_history[i];
    const sourceId = normalizeString(row.id);
    const sourceClientId = normalizeString(getFirst(row, ["client_id"]));
    if (sourceId && localMealHistoryByLegacy.has(sourceId)) {
      report.tables.meal_history.existingByLegacy += 1;
      incSkipped(report, "meal_history", "MEAL_HISTORY_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: localMealHistoryByLegacy.get(sourceId).id,
      });
      continue;
    }
    if (!clientByLegacyClientId.has(sourceClientId)) {
      report.relationshipSummary.clientMappingFailures += 1;
      incSkipped(report, "meal_history", "MEAL_HISTORY_CLIENT_NOT_MAPPED", {
        sourceId,
        sourceClientId: sourceClientId || null,
      });
      continue;
    }
    incImportable(report, "meal_history");
  }

  // MEAL LOGS
  for (let i = 0; i < sourceRows.meal_logs.length; i += 1) {
    const row = sourceRows.meal_logs[i];
    const sourceId = normalizeString(row.id);
    const sourceClientId = normalizeString(getFirst(row, ["client_id"]));
    const dateValue = normalizeString(getFirst(row, ["date"]));
    if (sourceId && localMealLogByLegacy.has(sourceId)) {
      report.tables.meal_logs.existingByLegacy += 1;
      incSkipped(report, "meal_logs", "MEAL_LOG_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: localMealLogByLegacy.get(sourceId).id,
      });
      continue;
    }
    if (!dateValue) {
      incSkipped(report, "meal_logs", "MEAL_LOG_MISSING_DATE", { sourceId, sourceIndex: i });
      continue;
    }
    if (!clientByLegacyClientId.has(sourceClientId)) {
      report.relationshipSummary.clientMappingFailures += 1;
      incSkipped(report, "meal_logs", "MEAL_LOG_CLIENT_NOT_MAPPED", {
        sourceId,
        sourceClientId: sourceClientId || null,
      });
      continue;
    }
    incImportable(report, "meal_logs");
  }

  // DRINK LOGS
  for (let i = 0; i < sourceRows.drink_logs.length; i += 1) {
    const row = sourceRows.drink_logs[i];
    const sourceId = normalizeString(row.id);
    const sourceClientId = normalizeString(getFirst(row, ["client_id"]));
    if (sourceId && localDrinkLogByLegacy.has(sourceId)) {
      report.tables.drink_logs.existingByLegacy += 1;
      incSkipped(report, "drink_logs", "DRINK_LOG_LEGACY_ALREADY_EXISTS", {
        sourceId,
        existingId: localDrinkLogByLegacy.get(sourceId).id,
      });
      continue;
    }
    if (!clientByLegacyClientId.has(sourceClientId)) {
      report.relationshipSummary.clientMappingFailures += 1;
      incSkipped(report, "drink_logs", "DRINK_LOG_CLIENT_NOT_MAPPED", {
        sourceId,
        sourceClientId: sourceClientId || null,
      });
      continue;
    }
    incImportable(report, "drink_logs");
  }

  for (const table of Object.keys(report.tables)) {
    report.summary.totalImportable += report.tables[table].importable;
    report.summary.totalSkipped += report.tables[table].skipped;
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Supabase Nutrition Dry-Run ===");
  console.log(`Backup folder: ${report.backupFolder}`);
  console.log("Input files:");
  for (const [table, fileName] of Object.entries(fileMap)) {
    console.log(`- ${table}: ${fileName}`);
  }
  console.log("--- Source totals ---");
  for (const [table, count] of Object.entries(report.sourceTotals)) {
    console.log(`${table}: ${count}`);
  }
  console.log("--- Importable / Skipped ---");
  for (const [table, info] of Object.entries(report.tables)) {
    console.log(`${table}: importable=${info.importable}, skipped=${info.skipped}, existingByLegacy=${info.existingByLegacy}`);
  }
  console.log("--- Relationship summary ---");
  for (const [k, v] of Object.entries(report.relationshipSummary)) {
    console.log(`${k}: ${v}`);
  }
  console.log("--- Conflict counts ---");
  for (const [k, v] of Object.entries(report.conflictCounts)) {
    console.log(`${k}: ${v}`);
  }
  console.log(`Report written: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((error) => {
  console.error(`Dry-run failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
