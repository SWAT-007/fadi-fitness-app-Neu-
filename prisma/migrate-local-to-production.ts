import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SOURCE_URL = process.env.DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;

if (!SOURCE_URL) { console.error("ERROR: DATABASE_URL is not set"); process.exit(1); }
if (!TARGET_URL) { console.error("ERROR: TARGET_DATABASE_URL is not set"); process.exit(1); }

const source = new PrismaClient({ adapter: new PrismaPg({ connectionString: SOURCE_URL }) });
const target = new PrismaClient({ adapter: new PrismaPg({ connectionString: TARGET_URL }) });

// Local ID → target ID maps for entities pre-seeded in Railway with different IDs
const userIdMap = new Map<string, string>();
const tpIdMap = new Map<string, string>();

function mu(localId: string): string {
  const t = userIdMap.get(localId);
  if (t === undefined) throw new Error(`userIdMap: no mapping for "${localId}"`);
  return t;
}

function mt(localId: string): string {
  const t = tpIdMap.get(localId);
  if (t === undefined) throw new Error(`tpIdMap: no mapping for "${localId}"`);
  return t;
}

function mtOpt(localId: string | null): string | null {
  if (localId === null) return null;
  const t = tpIdMap.get(localId);
  if (t === undefined) throw new Error(`tpIdMap: no optional mapping for "${localId}"`);
  return t;
}

function row(label: string, total: number, written: number) {
  const skipped = total - written;
  console.log(`  ${label.padEnd(30)} total=${String(total).padStart(4)}  written=${String(written).padStart(4)}  skipped=${String(skipped).padStart(4)}`);
}

// ── Phase 1: Users ──────────────────────────────────────────────────────────
async function migrateUsers() {
  const records = await source.user.findMany();
  for (const u of records) {
    const r = await target.user.upsert({
      where: { email: u.email },
      create: {
        id: u.id,
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role,
        authState: u.authState,
        fullName: u.fullName,
        isActive: u.isActive,
        legacySupabaseProfileId: u.legacySupabaseProfileId,
        createdAt: u.createdAt,
      },
      update: {
        passwordHash: u.passwordHash,
        role: u.role,
        authState: u.authState,
        fullName: u.fullName,
        isActive: u.isActive,
        legacySupabaseProfileId: u.legacySupabaseProfileId,
      },
      select: { id: true },
    });
    userIdMap.set(u.id, r.id);
  }
  row("User", records.length, records.length);
}

// ── Phase 2: TrainerProfiles ────────────────────────────────────────────────
async function migrateTrainerProfiles() {
  const records = await source.trainerProfile.findMany();
  for (const p of records) {
    const targetUserId = mu(p.userId);
    const r = await target.trainerProfile.upsert({
      where: { userId: targetUserId },
      create: { id: p.id, userId: targetUserId, createdAt: p.createdAt },
      update: {},
      select: { id: true },
    });
    tpIdMap.set(p.id, r.id);
  }
  row("TrainerProfile", records.length, records.length);
}

// ── Phase 3: ClientProfiles ─────────────────────────────────────────────────
async function migrateClientProfiles() {
  const records = await source.clientProfile.findMany();
  if (!records.length) { row("ClientProfile", 0, 0); return; }
  const r = await target.clientProfile.createMany({
    data: records.map(cp => ({
      id: cp.id,
      userId: cp.userId !== null ? (userIdMap.get(cp.userId) ?? cp.userId) : null,
      trainerId: mt(cp.trainerId),
      fullName: cp.fullName,
      email: cp.email,
      phone: cp.phone,
      notes: cp.notes,
      status: cp.status,
      legacySupabaseClientId: cp.legacySupabaseClientId,
      legacySupabaseUserId: cp.legacySupabaseUserId,
      createdAt: cp.createdAt,
      updatedAt: cp.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("ClientProfile", records.length, r.count);
}

// ── Phase 4: ClientLinkTokens ───────────────────────────────────────────────
async function migrateClientLinkTokens() {
  const records = await source.clientLinkToken.findMany();
  if (!records.length) { row("ClientLinkToken", 0, 0); return; }
  const r = await target.clientLinkToken.createMany({
    data: records.map(t => ({
      id: t.id,
      trainerId: mt(t.trainerId),
      email: t.email,
      tokenHash: t.tokenHash,
      expiresAt: t.expiresAt,
      consumedAt: t.consumedAt,
      createdAt: t.createdAt,
    })),
    skipDuplicates: true,
  });
  row("ClientLinkToken", records.length, r.count);
}

// ── Phase 5: ExerciseLibrary ────────────────────────────────────────────────
async function migrateExerciseLibrary() {
  const records = await source.exerciseLibrary.findMany();
  if (!records.length) { row("ExerciseLibrary", 0, 0); return; }
  const r = await target.exerciseLibrary.createMany({
    data: records.map(e => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
      imageUrl: e.imageUrl,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("ExerciseLibrary", records.length, r.count);
}

// ── Phase 6: WorkoutPlans ───────────────────────────────────────────────────
async function migrateWorkoutPlans() {
  const records = await source.workoutPlan.findMany();
  if (!records.length) { row("WorkoutPlan", 0, 0); return; }
  const r = await target.workoutPlan.createMany({
    data: records.map(p => ({
      id: p.id,
      trainerId: mt(p.trainerId),
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      legacySupabasePlanId: p.legacySupabasePlanId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("WorkoutPlan", records.length, r.count);
}

// ── Phase 7: WorkoutDays ────────────────────────────────────────────────────
async function migrateWorkoutDays() {
  const records = await source.workoutDay.findMany();
  if (!records.length) { row("WorkoutDay", 0, 0); return; }
  const r = await target.workoutDay.createMany({
    data: records.map(d => ({
      id: d.id,
      planId: d.planId,
      name: d.name,
      description: d.description,
      sortOrder: d.sortOrder,
      legacySupabaseDayId: d.legacySupabaseDayId,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("WorkoutDay", records.length, r.count);
}

// ── Phase 8: Exercises ──────────────────────────────────────────────────────
async function migrateExercises() {
  const records = await source.exercise.findMany();
  if (!records.length) { row("Exercise", 0, 0); return; }
  const r = await target.exercise.createMany({
    data: records.map(e => ({
      id: e.id,
      dayId: e.dayId,
      name: e.name,
      description: e.description,
      sets: e.sets,
      reps: e.reps,
      targetWeightKg: e.targetWeightKg,
      restSeconds: e.restSeconds,
      note: e.note,
      sortOrder: e.sortOrder,
      imageUrl: e.imageUrl,
      legacySupabaseExerciseId: e.legacySupabaseExerciseId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("Exercise", records.length, r.count);
}

// ── Phase 9: Foods ──────────────────────────────────────────────────────────
async function migrateFoods() {
  const records = await source.food.findMany();
  if (!records.length) { row("Food", 0, 0); return; }
  const r = await target.food.createMany({
    data: records.map(f => ({
      id: f.id,
      trainerId: mtOpt(f.trainerId),
      name: f.name,
      caloriesPer100g: f.caloriesPer100g,
      proteinPer100g: f.proteinPer100g,
      carbsPer100g: f.carbsPer100g,
      fatPer100g: f.fatPer100g,
      unit: f.unit,
      category: f.category,
      brand: f.brand,
      barcode: f.barcode,
      defaultServingG: f.defaultServingG,
      source: f.source,
      legacySupabaseFoodId: f.legacySupabaseFoodId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("Food", records.length, r.count);
}

// ── Phase 10: Recipes ───────────────────────────────────────────────────────
async function migrateRecipes() {
  const records = await source.recipe.findMany();
  if (!records.length) { row("Recipe", 0, 0); return; }
  const r = await target.recipe.createMany({
    data: records.map(rc => ({
      id: rc.id,
      trainerId: mtOpt(rc.trainerId),
      name: rc.name,
      description: rc.description,
      instructions: rc.instructions,
      imageUrl: rc.imageUrl,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ingredients: rc.ingredients as any,
      servings: rc.servings,
      totalCalories: rc.totalCalories,
      proteinG: rc.proteinG,
      carbsG: rc.carbsG,
      fatG: rc.fatG,
      sourcePdf: rc.sourcePdf,
      category: rc.category,
      prepTimeMinutes: rc.prepTimeMinutes,
      cookTimeMinutes: rc.cookTimeMinutes,
      legacySupabaseRecipeId: rc.legacySupabaseRecipeId,
      createdAt: rc.createdAt,
      updatedAt: rc.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("Recipe", records.length, r.count);
}

// ── Phase 11: NutritionPlans ────────────────────────────────────────────────
async function migrateNutritionPlans() {
  const records = await source.nutritionPlan.findMany();
  if (!records.length) { row("NutritionPlan", 0, 0); return; }
  const r = await target.nutritionPlan.createMany({
    data: records.map(np => ({
      id: np.id,
      trainerId: mt(np.trainerId),
      name: np.name,
      description: np.description,
      legacySupabaseNutritionPlanId: np.legacySupabaseNutritionPlanId,
      createdAt: np.createdAt,
      updatedAt: np.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("NutritionPlan", records.length, r.count);
}

// ── Phase 12: NutritionMeals ────────────────────────────────────────────────
async function migrateNutritionMeals() {
  const records = await source.nutritionMeal.findMany();
  if (!records.length) { row("NutritionMeal", 0, 0); return; }
  const r = await target.nutritionMeal.createMany({
    data: records.map(nm => ({
      id: nm.id,
      planId: nm.planId,
      name: nm.name,
      description: nm.description,
      sortOrder: nm.sortOrder,
      legacySupabaseNutritionMealId: nm.legacySupabaseNutritionMealId,
      createdAt: nm.createdAt,
      updatedAt: nm.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("NutritionMeal", records.length, r.count);
}

// ── Phase 13: AssignedPlans ─────────────────────────────────────────────────
async function migrateAssignedPlans() {
  const records = await source.assignedPlan.findMany();
  if (!records.length) { row("AssignedPlan", 0, 0); return; }
  const r = await target.assignedPlan.createMany({
    data: records.map(ap => ({
      id: ap.id,
      clientId: ap.clientId,
      planId: ap.planId,
      assignedAt: ap.assignedAt,
      active: ap.active,
      legacySupabaseAssignedPlanId: ap.legacySupabaseAssignedPlanId,
    })),
    skipDuplicates: true,
  });
  row("AssignedPlan", records.length, r.count);
}

// ── Phase 14: AssignedNutritionPlans ────────────────────────────────────────
async function migrateAssignedNutritionPlans() {
  const records = await source.assignedNutritionPlan.findMany();
  if (!records.length) { row("AssignedNutritionPlan", 0, 0); return; }
  const r = await target.assignedNutritionPlan.createMany({
    data: records.map(anp => ({
      id: anp.id,
      clientId: anp.clientId,
      planId: anp.planId,
      active: anp.active,
      assignedAt: anp.assignedAt,
      legacySupabaseAssignedNutritionPlanId: anp.legacySupabaseAssignedNutritionPlanId,
    })),
    skipDuplicates: true,
  });
  row("AssignedNutritionPlan", records.length, r.count);
}

// ── Phase 15: ClientMealFoods ───────────────────────────────────────────────
async function migrateClientMealFoods() {
  const records = await source.clientMealFood.findMany();
  if (!records.length) { row("ClientMealFood", 0, 0); return; }
  const r = await target.clientMealFood.createMany({
    data: records.map(cmf => ({
      id: cmf.id,
      clientId: cmf.clientId,
      mealId: cmf.mealId,
      foodId: cmf.foodId,
      category: cmf.category,
      amountG: cmf.amountG,
      legacySupabaseClientMealFoodId: cmf.legacySupabaseClientMealFoodId,
      createdAt: cmf.createdAt,
      updatedAt: cmf.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("ClientMealFood", records.length, r.count);
}

// ── Phase 16: MealHistory ───────────────────────────────────────────────────
async function migrateMealHistory() {
  const records = await source.mealHistory.findMany();
  if (!records.length) { row("MealHistory", 0, 0); return; }
  const r = await target.mealHistory.createMany({
    data: records.map(mh => ({
      id: mh.id,
      clientId: mh.clientId,
      name: mh.name,
      category: mh.category,
      amountG: mh.amountG,
      calories: mh.calories,
      protein: mh.protein,
      carbs: mh.carbs,
      fat: mh.fat,
      loggedAt: mh.loggedAt,
      legacySupabaseMealHistoryId: mh.legacySupabaseMealHistoryId,
    })),
    skipDuplicates: true,
  });
  row("MealHistory", records.length, r.count);
}

// ── Phase 17: MealLogs ──────────────────────────────────────────────────────
async function migrateMealLogs() {
  const records = await source.mealLog.findMany();
  if (!records.length) { row("MealLog", 0, 0); return; }
  const r = await target.mealLog.createMany({
    data: records.map(ml => ({
      id: ml.id,
      clientId: ml.clientId,
      date: ml.date,
      mealType: ml.mealType,
      notes: ml.notes,
      legacySupabaseMealLogId: ml.legacySupabaseMealLogId,
      createdAt: ml.createdAt,
      updatedAt: ml.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("MealLog", records.length, r.count);
}

// ── Phase 18: DrinkLogs ─────────────────────────────────────────────────────
async function migrateDrinkLogs() {
  const records = await source.drinkLog.findMany();
  if (!records.length) { row("DrinkLog", 0, 0); return; }
  const r = await target.drinkLog.createMany({
    data: records.map(dl => ({
      id: dl.id,
      clientId: dl.clientId,
      drinkType: dl.drinkType,
      amountMl: dl.amountMl,
      loggedAt: dl.loggedAt,
      legacySupabaseDrinkLogId: dl.legacySupabaseDrinkLogId,
    })),
    skipDuplicates: true,
  });
  row("DrinkLog", records.length, r.count);
}

// ── Phase 19: Notifications ─────────────────────────────────────────────────
async function migrateNotifications() {
  const records = await source.notification.findMany();
  if (!records.length) { row("Notification", 0, 0); return; }
  const r = await target.notification.createMany({
    data: records.map(n => ({
      id: n.id,
      userId: mu(n.userId),
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt,
      readAt: n.readAt,
    })),
    skipDuplicates: true,
  });
  row("Notification", records.length, r.count);
}

// ── Phase 20: Messages ──────────────────────────────────────────────────────
async function migrateMessages() {
  const records = await source.message.findMany();
  if (!records.length) { row("Message", 0, 0); return; }
  const r = await target.message.createMany({
    data: records.map(m => ({
      id: m.id,
      senderId: mu(m.senderId),
      receiverId: mu(m.receiverId),
      content: m.content,
      createdAt: m.createdAt,
      readAt: m.readAt,
    })),
    skipDuplicates: true,
  });
  row("Message", records.length, r.count);
}

// ── Phase 21: WorkoutLogs ───────────────────────────────────────────────────
async function migrateWorkoutLogs() {
  const records = await source.workoutLog.findMany();
  if (!records.length) { row("WorkoutLog", 0, 0); return; }
  const r = await target.workoutLog.createMany({
    data: records.map(wl => ({
      id: wl.id,
      clientId: wl.clientId,
      dayId: wl.dayId,
      date: wl.date,
      notes: wl.notes,
      completedAt: wl.completedAt,
      durationSeconds: wl.durationSeconds,
      createdAt: wl.createdAt,
      updatedAt: wl.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("WorkoutLog", records.length, r.count);
}

// ── Phase 22: ExerciseLogs ──────────────────────────────────────────────────
async function migrateExerciseLogs() {
  const records = await source.exerciseLog.findMany();
  if (!records.length) { row("ExerciseLog", 0, 0); return; }
  const r = await target.exerciseLog.createMany({
    data: records.map(el => ({
      id: el.id,
      workoutLogId: el.workoutLogId,
      exerciseId: el.exerciseId,
      actualWeight: el.actualWeight,
      actualReps: el.actualReps,
      setsDone: el.setsDone,
      completed: el.completed,
      note: el.note,
      createdAt: el.createdAt,
      updatedAt: el.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("ExerciseLog", records.length, r.count);
}

// ── Phase 23: ExerciseChangeRequests ───────────────────────────────────────
async function migrateExerciseChangeRequests() {
  const records = await source.exerciseChangeRequest.findMany();
  if (!records.length) { row("ExerciseChangeRequest", 0, 0); return; }
  const r = await target.exerciseChangeRequest.createMany({
    data: records.map(ecr => ({
      id: ecr.id,
      clientId: ecr.clientId,
      dayId: ecr.dayId,
      exerciseId: ecr.exerciseId,
      reason: ecr.reason,
      status: ecr.status,
      createdAt: ecr.createdAt,
      updatedAt: ecr.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("ExerciseChangeRequest", records.length, r.count);
}

// ── Phase 24: ProgressLogs ──────────────────────────────────────────────────
async function migrateProgressLogs() {
  const records = await source.progressLog.findMany();
  if (!records.length) { row("ProgressLog", 0, 0); return; }
  const r = await target.progressLog.createMany({
    data: records.map(pl => ({
      id: pl.id,
      clientId: pl.clientId,
      date: pl.date,
      bodyWeight: pl.bodyWeight,
      notes: pl.notes,
      legacySupabaseProgressLogId: pl.legacySupabaseProgressLogId,
      createdAt: pl.createdAt,
      updatedAt: pl.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("ProgressLog", records.length, r.count);
}

// ── Phase 25: WeeklyCheckins ────────────────────────────────────────────────
async function migrateWeeklyCheckins() {
  const records = await source.weeklyCheckin.findMany();
  if (!records.length) { row("WeeklyCheckin", 0, 0); return; }
  const r = await target.weeklyCheckin.createMany({
    data: records.map(wc => ({
      id: wc.id,
      clientId: wc.clientId,
      weekStart: wc.weekStart,
      mood: wc.mood,
      energy: wc.energy,
      sleepQuality: wc.sleepQuality,
      hunger: wc.hunger,
      stress: wc.stress,
      bodyWeight: wc.bodyWeight,
      comment: wc.comment,
      legacySupabaseWeeklyCheckinId: wc.legacySupabaseWeeklyCheckinId,
      createdAt: wc.createdAt,
      updatedAt: wc.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("WeeklyCheckin", records.length, r.count);
}

// ── Phase 26: CheckinImages ─────────────────────────────────────────────────
async function migrateCheckinImages() {
  const records = await source.checkinImage.findMany();
  if (!records.length) { row("CheckinImage", 0, 0); return; }
  const r = await target.checkinImage.createMany({
    data: records.map(ci => ({
      id: ci.id,
      checkinId: ci.checkinId,
      storagePath: ci.storagePath,
      legacySupabaseCheckinImageId: ci.legacySupabaseCheckinImageId,
      createdAt: ci.createdAt,
      updatedAt: ci.updatedAt,
    })),
    skipDuplicates: true,
  });
  row("CheckinImage", records.length, r.count);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const maskUrl = (u: string) => u.replace(/:[^:@]+@/, ":***@");
  console.log("=== Local → Railway migration ===");
  console.log(`Source: ${maskUrl(SOURCE_URL!)}`);
  console.log(`Target: ${maskUrl(TARGET_URL!)}\n`);

  await migrateUsers();
  await migrateTrainerProfiles();
  await migrateClientProfiles();
  await migrateClientLinkTokens();
  await migrateExerciseLibrary();
  await migrateWorkoutPlans();
  await migrateWorkoutDays();
  await migrateExercises();
  await migrateFoods();
  await migrateRecipes();
  await migrateNutritionPlans();
  await migrateNutritionMeals();
  await migrateAssignedPlans();
  await migrateAssignedNutritionPlans();
  await migrateClientMealFoods();
  await migrateMealHistory();
  await migrateMealLogs();
  await migrateDrinkLogs();
  await migrateNotifications();
  await migrateMessages();
  await migrateWorkoutLogs();
  await migrateExerciseLogs();
  await migrateExerciseChangeRequests();
  await migrateProgressLogs();
  await migrateWeeklyCheckins();
  await migrateCheckinImages();

  console.log("\n=== Migration complete ===");
}

main()
  .catch((e) => {
    console.error("\nMigration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
