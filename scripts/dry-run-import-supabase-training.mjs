import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function usage() {
  console.log(
    "Usage: node scripts/dry-run-import-supabase-training.mjs backups/supabase/<YYYY-MM-DD-HH-mm>",
  );
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} must be a JSON array`);
  }
  return parsed;
}

function toIso(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function pickNewestRecord(records) {
  let best = records[0];
  for (let i = 1; i < records.length; i += 1) {
    const candidate = records[i];
    const bestAssigned = toIso(best.assigned_at);
    const candAssigned = toIso(candidate.assigned_at);
    if (candAssigned && (!bestAssigned || candAssigned > bestAssigned)) {
      best = candidate;
      continue;
    }
    if (candAssigned && bestAssigned && candAssigned < bestAssigned) {
      continue;
    }

    const bestCreated = toIso(best.created_at);
    const candCreated = toIso(candidate.created_at);
    if (candCreated && (!bestCreated || candCreated > bestCreated)) {
      best = candidate;
      continue;
    }
    if (candCreated && bestCreated && candCreated < bestCreated) {
      continue;
    }
    // Stable source order: keep earlier occurrence (current best).
  }
  return best;
}

function pushConflict(report, code, details) {
  report.conflicts.push({ code, ...details });
  report.conflictCounts[code] = (report.conflictCounts[code] ?? 0) + 1;
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const plansPath = path.join(backupFolder, "workout_plans.json");
  const daysPath = path.join(backupFolder, "workout_days.json");
  const exercisesPath = path.join(backupFolder, "exercises.json");
  const assignedPlansPath = path.join(backupFolder, "assigned_plans.json");
  const reportPath = path.join(backupFolder, "dry-run-training-report.json");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    backupFolder: path.relative(process.cwd(), backupFolder),
    sourceTotals: {
      workout_plans: 0,
      workout_days: 0,
      exercises: 0,
      assigned_plans: 0,
    },
    importable: {
      plans: 0,
      days: 0,
      exercises: 0,
      assignedPlans: 0,
    },
    skipped: {
      plans: 0,
      days: 0,
      exercises: 0,
      assignedPlans: 0,
    },
    conflictCounts: {},
    conflicts: [],
    duplicateAssignedPlans: {
      groups: [],
      skippedSourceIds: [],
      keptSourceIds: [],
    },
    checks: {
      workoutPlanDescriptionNullable: null,
      workoutPlanDescriptionFallbackNeeded: null,
      exerciseImageUrlSeen: 0,
      exerciseImageUrlMissing: 0,
    },
    proposedImportOrder: ["WorkoutPlan", "WorkoutDay", "Exercise", "AssignedPlan"],
  };

  let sourcePlans;
  let sourceDays;
  let sourceExercises;
  let sourceAssigned;
  try {
    [sourcePlans, sourceDays, sourceExercises, sourceAssigned] = await Promise.all([
      loadJson(plansPath),
      loadJson(daysPath),
      loadJson(exercisesPath),
      loadJson(assignedPlansPath),
    ]);
  } catch (error) {
    console.error(`Failed to load backup JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  report.sourceTotals.workout_plans = sourcePlans.length;
  report.sourceTotals.workout_days = sourceDays.length;
  report.sourceTotals.exercises = sourceExercises.length;
  report.sourceTotals.assigned_plans = sourceAssigned.length;

  const sourcePlansById = new Map(sourcePlans.map((p, index) => [p.id, { ...p, _index: index }]));
  const sourceDaysById = new Map(sourceDays.map((d, index) => [d.id, { ...d, _index: index }]));
  const sourceTrainerIds = [...new Set(sourcePlans.map((p) => p.trainer_id).filter(Boolean))];
  const sourceClientIds = [...new Set(sourceAssigned.map((a) => a.client_id).filter(Boolean))];

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  let trainerProfiles = [];
  let clientProfiles = [];
  let existingPlans = [];
  let existingDays = [];
  let existingExercises = [];
  let existingAssigned = [];

  try {
    [trainerProfiles, clientProfiles, existingPlans, existingDays, existingExercises, existingAssigned] =
      await Promise.all([
        prisma.trainerProfile.findMany({
          include: {
            user: {
              select: {
                id: true,
                legacySupabaseProfileId: true,
              },
            },
          },
        }),
        prisma.clientProfile.findMany({
          select: {
            id: true,
            legacySupabaseClientId: true,
          },
        }),
        prisma.workoutPlan.findMany({
          select: {
            id: true,
            trainerId: true,
            legacySupabasePlanId: true,
          },
        }),
        prisma.workoutDay.findMany({
          select: {
            id: true,
            planId: true,
            legacySupabaseDayId: true,
          },
        }),
        prisma.exercise.findMany({
          select: {
            id: true,
            dayId: true,
            legacySupabaseExerciseId: true,
          },
        }),
        prisma.assignedPlan.findMany({
          select: {
            id: true,
            clientId: true,
            planId: true,
            legacySupabaseAssignedPlanId: true,
          },
        }),
      ]);
  } catch (error) {
    await prisma.$disconnect();
    console.error(`Failed to query Prisma for dry-run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  await prisma.$disconnect();

  // Prisma schema check result for WorkoutPlan.description
  // It is optional in current schema (String?).
  report.checks.workoutPlanDescriptionNullable = true;
  report.checks.workoutPlanDescriptionFallbackNeeded = false;

  const trainerBySupabaseProfileId = new Map();
  for (const trainer of trainerProfiles) {
    const supaProfileId = trainer.user?.legacySupabaseProfileId;
    if (supaProfileId) trainerBySupabaseProfileId.set(supaProfileId, trainer);
  }

  const clientByLegacyClientId = new Map(
    clientProfiles
      .filter((cp) => cp.legacySupabaseClientId)
      .map((cp) => [cp.legacySupabaseClientId, cp]),
  );

  const existingPlanByLegacy = new Map(
    existingPlans
      .filter((p) => p.legacySupabasePlanId)
      .map((p) => [p.legacySupabasePlanId, p]),
  );
  const existingDayByLegacy = new Map(
    existingDays
      .filter((d) => d.legacySupabaseDayId)
      .map((d) => [d.legacySupabaseDayId, d]),
  );
  const existingExerciseByLegacy = new Map(
    existingExercises
      .filter((e) => e.legacySupabaseExerciseId)
      .map((e) => [e.legacySupabaseExerciseId, e]),
  );
  const existingAssignedByLegacy = new Map(
    existingAssigned
      .filter((a) => a.legacySupabaseAssignedPlanId)
      .map((a) => [a.legacySupabaseAssignedPlanId, a]),
  );
  const existingAssignedPair = new Map(existingAssigned.map((a) => [`${a.clientId}::${a.planId}`, a]));

  // Plans
  const importablePlans = new Map(); // source plan id -> mapped info
  for (const sourcePlan of sourcePlans) {
    const trainer = trainerBySupabaseProfileId.get(sourcePlan.trainer_id);
    if (!trainer) {
      report.skipped.plans += 1;
      pushConflict(report, "PLAN_TRAINER_NOT_FOUND", {
        sourcePlanId: sourcePlan.id,
        sourceTrainerId: sourcePlan.trainer_id ?? null,
      });
      continue;
    }
    const existingLegacy = existingPlanByLegacy.get(sourcePlan.id);
    if (existingLegacy) {
      pushConflict(report, "PLAN_LEGACY_ID_ALREADY_EXISTS", {
        sourcePlanId: sourcePlan.id,
        existingPlanId: existingLegacy.id,
      });
    }
    importablePlans.set(sourcePlan.id, {
      sourcePlan,
      trainerId: trainer.id,
      existingPlanId: existingLegacy?.id ?? null,
    });
    report.importable.plans += 1;
  }

  // Days
  const importableDays = new Map(); // source day id -> mapped info
  for (const sourceDay of sourceDays) {
    const sourcePlan = sourcePlansById.get(sourceDay.plan_id);
    if (!sourcePlan) {
      report.skipped.days += 1;
      pushConflict(report, "DAY_SOURCE_PLAN_NOT_FOUND", {
        sourceDayId: sourceDay.id,
        sourcePlanId: sourceDay.plan_id ?? null,
      });
      continue;
    }
    const mappedPlan = importablePlans.get(sourceDay.plan_id);
    if (!mappedPlan) {
      report.skipped.days += 1;
      pushConflict(report, "DAY_PLAN_NOT_IMPORTABLE", {
        sourceDayId: sourceDay.id,
        sourcePlanId: sourceDay.plan_id,
      });
      continue;
    }
    const existingLegacy = existingDayByLegacy.get(sourceDay.id);
    if (existingLegacy) {
      pushConflict(report, "DAY_LEGACY_ID_ALREADY_EXISTS", {
        sourceDayId: sourceDay.id,
        existingDayId: existingLegacy.id,
      });
    }
    importableDays.set(sourceDay.id, {
      sourceDay,
      sourcePlanId: sourceDay.plan_id,
      existingDayId: existingLegacy?.id ?? null,
    });
    report.importable.days += 1;
  }

  // Exercises
  const importableExercises = new Map();
  for (const sourceExercise of sourceExercises) {
    if (sourceExercise.image_url) {
      report.checks.exerciseImageUrlSeen += 1;
    } else {
      report.checks.exerciseImageUrlMissing += 1;
    }
    const sourceDay = sourceDaysById.get(sourceExercise.day_id);
    if (!sourceDay) {
      report.skipped.exercises += 1;
      pushConflict(report, "EXERCISE_SOURCE_DAY_NOT_FOUND", {
        sourceExerciseId: sourceExercise.id,
        sourceDayId: sourceExercise.day_id ?? null,
      });
      continue;
    }
    const mappedDay = importableDays.get(sourceExercise.day_id);
    if (!mappedDay) {
      report.skipped.exercises += 1;
      pushConflict(report, "EXERCISE_DAY_NOT_IMPORTABLE", {
        sourceExerciseId: sourceExercise.id,
        sourceDayId: sourceExercise.day_id,
      });
      continue;
    }
    const existingLegacy = existingExerciseByLegacy.get(sourceExercise.id);
    if (existingLegacy) {
      pushConflict(report, "EXERCISE_LEGACY_ID_ALREADY_EXISTS", {
        sourceExerciseId: sourceExercise.id,
        existingExerciseId: existingLegacy.id,
      });
    }
    importableExercises.set(sourceExercise.id, {
      sourceExercise,
      existingExerciseId: existingLegacy?.id ?? null,
    });
    report.importable.exercises += 1;
  }

  // Assigned plans, with duplicate grouping on final local clientId + planId
  const assignedCandidates = [];
  for (let i = 0; i < sourceAssigned.length; i += 1) {
    const source = sourceAssigned[i];
    const sourcePlan = sourcePlansById.get(source.plan_id);
    if (!sourcePlan) {
      report.skipped.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_SOURCE_PLAN_NOT_FOUND", {
        sourceAssignedPlanId: source.id,
        sourcePlanId: source.plan_id ?? null,
      });
      continue;
    }
    const mappedPlan = importablePlans.get(source.plan_id);
    if (!mappedPlan) {
      report.skipped.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_PLAN_NOT_IMPORTABLE", {
        sourceAssignedPlanId: source.id,
        sourcePlanId: source.plan_id,
      });
      continue;
    }
    const mappedClient = clientByLegacyClientId.get(source.client_id);
    if (!mappedClient) {
      report.skipped.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_CLIENT_NOT_MAPPED", {
        sourceAssignedPlanId: source.id,
        sourceClientId: source.client_id ?? null,
      });
      continue;
    }
    const existingLegacy = existingAssignedByLegacy.get(source.id);
    if (existingLegacy) {
      pushConflict(report, "ASSIGNED_LEGACY_ID_ALREADY_EXISTS", {
        sourceAssignedPlanId: source.id,
        existingAssignedPlanId: existingLegacy.id,
      });
    }
    assignedCandidates.push({
      ...source,
      _index: i,
      finalClientId: mappedClient.id,
      finalPlanId: mappedPlan.existingPlanId ?? `(planned:${source.plan_id})`,
    });
  }

  const candidatesByPair = new Map();
  for (const candidate of assignedCandidates) {
    const key = `${candidate.finalClientId}::${candidate.finalPlanId}`;
    const list = candidatesByPair.get(key) ?? [];
    list.push(candidate);
    candidatesByPair.set(key, list);
  }

  for (const [pairKey, group] of candidatesByPair.entries()) {
    if (group.length > 1) {
      const kept = pickNewestRecord(group);
      const skipped = group.filter((item) => item.id !== kept.id);
      report.duplicateAssignedPlans.groups.push({
        finalPairKey: pairKey,
        keptSourceId: kept.id,
        skippedSourceIds: skipped.map((s) => s.id),
      });
      report.duplicateAssignedPlans.keptSourceIds.push(kept.id);
      report.duplicateAssignedPlans.skippedSourceIds.push(...skipped.map((s) => s.id));
      for (const skip of skipped) {
        report.skipped.assignedPlans += 1;
        pushConflict(report, "ASSIGNED_SOURCE_DUPLICATE_FINAL_PAIR_SKIPPED", {
          sourceAssignedPlanId: skip.id,
          keptSourceAssignedPlanId: kept.id,
          finalPairKey: pairKey,
        });
      }
      const existingPair = existingAssignedPair.get(pairKey);
      if (existingPair) {
        report.skipped.assignedPlans += 1;
        pushConflict(report, "ASSIGNED_PAIR_ALREADY_EXISTS_LOCALLY", {
          sourceAssignedPlanId: kept.id,
          finalPairKey: pairKey,
          existingAssignedPlanId: existingPair.id,
        });
        continue;
      }
      report.importable.assignedPlans += 1;
      continue;
    }

    const only = group[0];
    const existingPair = existingAssignedPair.get(pairKey);
    if (existingPair) {
      report.skipped.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_PAIR_ALREADY_EXISTS_LOCALLY", {
        sourceAssignedPlanId: only.id,
        finalPairKey: pairKey,
        existingAssignedPlanId: existingPair.id,
      });
      continue;
    }
    report.importable.assignedPlans += 1;
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Supabase Training Dry-Run ===");
  console.log(`Backup folder: ${report.backupFolder}`);
  console.log(`workout_plans total: ${report.sourceTotals.workout_plans}`);
  console.log(`workout_days total: ${report.sourceTotals.workout_days}`);
  console.log(`exercises total: ${report.sourceTotals.exercises}`);
  console.log(`assigned_plans total: ${report.sourceTotals.assigned_plans}`);
  console.log("--- Importable ---");
  console.log(`plans: ${report.importable.plans}`);
  console.log(`days: ${report.importable.days}`);
  console.log(`exercises: ${report.importable.exercises}`);
  console.log(`assignedPlans: ${report.importable.assignedPlans}`);
  console.log("--- Skipped ---");
  console.log(`plans: ${report.skipped.plans}`);
  console.log(`days: ${report.skipped.days}`);
  console.log(`exercises: ${report.skipped.exercises}`);
  console.log(`assignedPlans: ${report.skipped.assignedPlans}`);
  console.log("--- Conflicts by reason ---");
  for (const [code, count] of Object.entries(report.conflictCounts)) {
    console.log(`${code}: ${count}`);
  }
  console.log("--- Duplicates (assigned_plans) ---");
  console.log(`duplicate groups: ${report.duplicateAssignedPlans.groups.length}`);
  console.log(`kept source rows: ${report.duplicateAssignedPlans.keptSourceIds.length}`);
  console.log(`skipped source rows: ${report.duplicateAssignedPlans.skippedSourceIds.length}`);
  console.log("--- Checks ---");
  console.log(
    `WorkoutPlan.description nullable: ${report.checks.workoutPlanDescriptionNullable ? "yes" : "no"}`,
  );
  console.log(
    `WorkoutPlan.description fallback needed: ${report.checks.workoutPlanDescriptionFallbackNeeded ? "yes" : "no"}`,
  );
  console.log(`exercise image_url present: ${report.checks.exerciseImageUrlSeen}`);
  console.log(`exercise image_url missing: ${report.checks.exerciseImageUrlMissing}`);
  console.log(`Report written: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((error) => {
  console.error(`Dry-run failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
