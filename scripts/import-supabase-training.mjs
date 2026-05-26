import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function usage() {
  console.log(
    "Usage: node scripts/import-supabase-training.mjs backups/supabase/<YYYY-MM-DD-HH-mm> [--apply --confirm]",
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

function toDate(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
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
    // Stable source order: keep earlier record.
  }
  return best;
}

function pushConflict(report, code, details) {
  report.conflicts.push({ code, ...details });
  report.conflictCounts[code] = (report.conflictCounts[code] ?? 0) + 1;
}

function parseArgs(argv) {
  const folderArg = argv[2];
  const flags = new Set(argv.slice(3));
  const applyRequested = flags.has("--apply");
  const confirmRequested = flags.has("--confirm");
  const apply = applyRequested && confirmRequested;
  return { folderArg, applyRequested, confirmRequested, apply };
}

async function main() {
  const { folderArg, applyRequested, confirmRequested, apply } = parseArgs(process.argv);
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (applyRequested !== confirmRequested) {
    console.error("Refusing write mode: use both flags together: --apply --confirm");
    process.exitCode = 1;
    return;
  }

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const plansPath = path.join(backupFolder, "workout_plans.json");
  const daysPath = path.join(backupFolder, "workout_days.json");
  const exercisesPath = path.join(backupFolder, "exercises.json");
  const assignedPlansPath = path.join(backupFolder, "assigned_plans.json");
  const reportPath = path.join(backupFolder, "import-training-report.json");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
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
    created: {
      plans: 0,
      days: 0,
      exercises: 0,
      assignedPlans: 0,
    },
    skippedExisting: {
      plans: 0,
      days: 0,
      exercises: 0,
      assignedPlans: 0,
    },
    skippedDuplicates: {
      assignedPlans: 0,
    },
    skippedConflicts: {
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
      workoutPlanDescriptionNullable: true,
      workoutPlanDescriptionFallbackNeeded: false,
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

  const sourcePlansById = new Map(sourcePlans.map((p, i) => [p.id, { ...p, _index: i }]));
  const sourceDaysById = new Map(sourceDays.map((d, i) => [d.id, { ...d, _index: i }]));

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
            user: { select: { id: true, legacySupabaseProfileId: true } },
          },
        }),
        prisma.clientProfile.findMany({
          select: { id: true, legacySupabaseClientId: true },
        }),
        prisma.workoutPlan.findMany({
          select: { id: true, trainerId: true, legacySupabasePlanId: true },
        }),
        prisma.workoutDay.findMany({
          select: { id: true, planId: true, legacySupabaseDayId: true },
        }),
        prisma.exercise.findMany({
          select: { id: true, dayId: true, legacySupabaseExerciseId: true },
        }),
        prisma.assignedPlan.findMany({
          select: { id: true, clientId: true, planId: true, legacySupabaseAssignedPlanId: true },
        }),
      ]);
  } catch (error) {
    await prisma.$disconnect();
    console.error(`Failed to query Prisma for import planning: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const trainerBySupabaseProfileId = new Map();
  for (const trainer of trainerProfiles) {
    const legacy = trainer.user?.legacySupabaseProfileId;
    if (legacy) trainerBySupabaseProfileId.set(legacy, trainer);
  }

  const clientByLegacyClientId = new Map(
    clientProfiles
      .filter((cp) => cp.legacySupabaseClientId)
      .map((cp) => [cp.legacySupabaseClientId, cp]),
  );

  const existingPlanByLegacy = new Map(
    existingPlans.filter((p) => p.legacySupabasePlanId).map((p) => [p.legacySupabasePlanId, p]),
  );
  const existingDayByLegacy = new Map(
    existingDays.filter((d) => d.legacySupabaseDayId).map((d) => [d.legacySupabaseDayId, d]),
  );
  const existingExerciseByLegacy = new Map(
    existingExercises.filter((e) => e.legacySupabaseExerciseId).map((e) => [e.legacySupabaseExerciseId, e]),
  );
  const existingAssignedByLegacy = new Map(
    existingAssigned
      .filter((a) => a.legacySupabaseAssignedPlanId)
      .map((a) => [a.legacySupabaseAssignedPlanId, a]),
  );
  const existingAssignedPair = new Map(existingAssigned.map((a) => [`${a.clientId}::${a.planId}`, a]));

  const planCandidates = [];
  for (const sourcePlan of sourcePlans) {
    const trainer = trainerBySupabaseProfileId.get(sourcePlan.trainer_id);
    if (!trainer) {
      report.skippedConflicts.plans += 1;
      pushConflict(report, "PLAN_TRAINER_NOT_FOUND", {
        sourcePlanId: sourcePlan.id,
        sourceTrainerId: sourcePlan.trainer_id ?? null,
      });
      continue;
    }
    const existingLegacy = existingPlanByLegacy.get(sourcePlan.id) ?? null;
    planCandidates.push({
      sourcePlan,
      trainerId: trainer.id,
      existingPlanId: existingLegacy?.id ?? null,
    });
    report.importable.plans += 1;
  }

  const planLocalIdBySourcePlanId = new Map();
  for (const candidate of planCandidates) {
    if (candidate.existingPlanId) {
      planLocalIdBySourcePlanId.set(candidate.sourcePlan.id, candidate.existingPlanId);
      report.skippedExisting.plans += 1;
      pushConflict(report, "PLAN_LEGACY_ID_ALREADY_EXISTS", {
        sourcePlanId: candidate.sourcePlan.id,
        existingPlanId: candidate.existingPlanId,
      });
    }
  }

  const dayCandidates = [];
  for (const sourceDay of sourceDays) {
    const sourcePlan = sourcePlansById.get(sourceDay.plan_id);
    if (!sourcePlan) {
      report.skippedConflicts.days += 1;
      pushConflict(report, "DAY_SOURCE_PLAN_NOT_FOUND", {
        sourceDayId: sourceDay.id,
        sourcePlanId: sourceDay.plan_id ?? null,
      });
      continue;
    }
    const mappedPlanCandidate = planCandidates.find((p) => p.sourcePlan.id === sourceDay.plan_id);
    if (!mappedPlanCandidate) {
      report.skippedConflicts.days += 1;
      pushConflict(report, "DAY_PLAN_NOT_IMPORTABLE", {
        sourceDayId: sourceDay.id,
        sourcePlanId: sourceDay.plan_id,
      });
      continue;
    }
    const existingLegacy = existingDayByLegacy.get(sourceDay.id) ?? null;
    dayCandidates.push({
      sourceDay,
      sourcePlanId: sourceDay.plan_id,
      existingDayId: existingLegacy?.id ?? null,
    });
    report.importable.days += 1;
  }

  const dayLocalIdBySourceDayId = new Map();
  for (const candidate of dayCandidates) {
    if (candidate.existingDayId) {
      dayLocalIdBySourceDayId.set(candidate.sourceDay.id, candidate.existingDayId);
      report.skippedExisting.days += 1;
      pushConflict(report, "DAY_LEGACY_ID_ALREADY_EXISTS", {
        sourceDayId: candidate.sourceDay.id,
        existingDayId: candidate.existingDayId,
      });
    }
  }

  const exerciseCandidates = [];
  for (const sourceExercise of sourceExercises) {
    if (sourceExercise.image_url) {
      report.checks.exerciseImageUrlSeen += 1;
    } else {
      report.checks.exerciseImageUrlMissing += 1;
    }
    const sourceDay = sourceDaysById.get(sourceExercise.day_id);
    if (!sourceDay) {
      report.skippedConflicts.exercises += 1;
      pushConflict(report, "EXERCISE_SOURCE_DAY_NOT_FOUND", {
        sourceExerciseId: sourceExercise.id,
        sourceDayId: sourceExercise.day_id ?? null,
      });
      continue;
    }
    const mappedDayCandidate = dayCandidates.find((d) => d.sourceDay.id === sourceExercise.day_id);
    if (!mappedDayCandidate) {
      report.skippedConflicts.exercises += 1;
      pushConflict(report, "EXERCISE_DAY_NOT_IMPORTABLE", {
        sourceExerciseId: sourceExercise.id,
        sourceDayId: sourceExercise.day_id,
      });
      continue;
    }
    const existingLegacy = existingExerciseByLegacy.get(sourceExercise.id) ?? null;
    exerciseCandidates.push({
      sourceExercise,
      sourceDayId: sourceExercise.day_id,
      existingExerciseId: existingLegacy?.id ?? null,
    });
    report.importable.exercises += 1;
  }

  for (const candidate of exerciseCandidates) {
    if (candidate.existingExerciseId) {
      report.skippedExisting.exercises += 1;
      pushConflict(report, "EXERCISE_LEGACY_ID_ALREADY_EXISTS", {
        sourceExerciseId: candidate.sourceExercise.id,
        existingExerciseId: candidate.existingExerciseId,
      });
    }
  }

  const assignedCandidatesInitial = [];
  for (let i = 0; i < sourceAssigned.length; i += 1) {
    const source = sourceAssigned[i];
    const sourcePlan = sourcePlansById.get(source.plan_id);
    if (!sourcePlan) {
      report.skippedConflicts.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_SOURCE_PLAN_NOT_FOUND", {
        sourceAssignedPlanId: source.id,
        sourcePlanId: source.plan_id ?? null,
      });
      continue;
    }
    const mappedPlanCandidate = planCandidates.find((p) => p.sourcePlan.id === source.plan_id);
    if (!mappedPlanCandidate) {
      report.skippedConflicts.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_PLAN_NOT_IMPORTABLE", {
        sourceAssignedPlanId: source.id,
        sourcePlanId: source.plan_id,
      });
      continue;
    }
    const mappedClient = clientByLegacyClientId.get(source.client_id);
    if (!mappedClient) {
      report.skippedConflicts.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_CLIENT_NOT_MAPPED", {
        sourceAssignedPlanId: source.id,
        sourceClientId: source.client_id ?? null,
      });
      continue;
    }
    const existingLegacy = existingAssignedByLegacy.get(source.id) ?? null;
    assignedCandidatesInitial.push({
      ...source,
      _index: i,
      finalClientId: mappedClient.id,
      sourcePlanId: source.plan_id,
      existingAssignedId: existingLegacy?.id ?? null,
    });
    if (existingLegacy) {
      report.skippedExisting.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_LEGACY_ID_ALREADY_EXISTS", {
        sourceAssignedPlanId: source.id,
        existingAssignedPlanId: existingLegacy.id,
      });
    }
  }

  // Re-resolve final plan IDs for dedupe: existing by legacy OR will-be-created source mapping placeholder.
  const assignedCandidatesForDedupe = assignedCandidatesInitial
    .filter((a) => !a.existingAssignedId)
    .map((a) => ({
      ...a,
      finalPlanKey: planLocalIdBySourcePlanId.get(a.sourcePlanId) ?? `(planned:${a.sourcePlanId})`,
    }));

  const candidatesByPair = new Map();
  for (const candidate of assignedCandidatesForDedupe) {
    const key = `${candidate.finalClientId}::${candidate.finalPlanKey}`;
    const list = candidatesByPair.get(key) ?? [];
    list.push(candidate);
    candidatesByPair.set(key, list);
  }

  const assignedCandidatesAfterDedupe = [];
  for (const [pairKey, group] of candidatesByPair.entries()) {
    if (group.length > 1) {
      const kept = pickNewestRecord(group);
      const skipped = group.filter((row) => row.id !== kept.id);
      report.duplicateAssignedPlans.groups.push({
        finalPairKey: pairKey,
        keptSourceId: kept.id,
        skippedSourceIds: skipped.map((s) => s.id),
      });
      report.duplicateAssignedPlans.keptSourceIds.push(kept.id);
      report.duplicateAssignedPlans.skippedSourceIds.push(...skipped.map((s) => s.id));
      report.skippedDuplicates.assignedPlans += skipped.length;
      for (const row of skipped) {
        pushConflict(report, "ASSIGNED_SOURCE_DUPLICATE_FINAL_PAIR_SKIPPED", {
          sourceAssignedPlanId: row.id,
          keptSourceAssignedPlanId: kept.id,
          finalPairKey: pairKey,
        });
      }
      assignedCandidatesAfterDedupe.push(kept);
    } else {
      assignedCandidatesAfterDedupe.push(group[0]);
    }
  }

  for (const candidate of assignedCandidatesAfterDedupe) {
    if (existingAssignedPair.has(`${candidate.finalClientId}::${candidate.finalPlanKey}`)) {
      report.skippedExisting.assignedPlans += 1;
      pushConflict(report, "ASSIGNED_PAIR_ALREADY_EXISTS_LOCALLY", {
        sourceAssignedPlanId: candidate.id,
        finalPairKey: `${candidate.finalClientId}::${candidate.finalPlanKey}`,
        existingAssignedPlanId: existingAssignedPair.get(`${candidate.finalClientId}::${candidate.finalPlanKey}`)?.id ?? null,
      });
      continue;
    }
    report.importable.assignedPlans += 1;
  }

  if (apply) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1) WorkoutPlan
        for (const candidate of planCandidates) {
          if (planLocalIdBySourcePlanId.has(candidate.sourcePlan.id)) continue;
          const created = await tx.workoutPlan.create({
            data: {
              trainerId: candidate.trainerId,
              name: typeof candidate.sourcePlan.name === "string" ? candidate.sourcePlan.name : "",
              description:
                typeof candidate.sourcePlan.description === "string" ? candidate.sourcePlan.description : null,
              legacySupabasePlanId: candidate.sourcePlan.id,
              createdAt: toDate(candidate.sourcePlan.created_at) ?? undefined,
            },
            select: { id: true },
          });
          planLocalIdBySourcePlanId.set(candidate.sourcePlan.id, created.id);
          report.created.plans += 1;
        }

        // 2) WorkoutDay
        for (const candidate of dayCandidates) {
          if (dayLocalIdBySourceDayId.has(candidate.sourceDay.id)) continue;
          const localPlanId = planLocalIdBySourcePlanId.get(candidate.sourcePlanId);
          if (!localPlanId) {
            report.skippedConflicts.days += 1;
            pushConflict(report, "DAY_PLAN_LOCAL_ID_UNRESOLVED", {
              sourceDayId: candidate.sourceDay.id,
              sourcePlanId: candidate.sourcePlanId,
            });
            continue;
          }
          const created = await tx.workoutDay.create({
            data: {
              planId: localPlanId,
              name: typeof candidate.sourceDay.name === "string" ? candidate.sourceDay.name : "",
              description:
                typeof candidate.sourceDay.description === "string" ? candidate.sourceDay.description : null,
              sortOrder: Number.isInteger(candidate.sourceDay.sort_order) ? candidate.sourceDay.sort_order : 0,
              legacySupabaseDayId: candidate.sourceDay.id,
              createdAt: toDate(candidate.sourceDay.created_at) ?? undefined,
            },
            select: { id: true },
          });
          dayLocalIdBySourceDayId.set(candidate.sourceDay.id, created.id);
          report.created.days += 1;
        }

        // 3) Exercise
        for (const candidate of exerciseCandidates) {
          if (candidate.existingExerciseId) continue;
          const localDayId = dayLocalIdBySourceDayId.get(candidate.sourceDayId);
          if (!localDayId) {
            report.skippedConflicts.exercises += 1;
            pushConflict(report, "EXERCISE_DAY_LOCAL_ID_UNRESOLVED", {
              sourceExerciseId: candidate.sourceExercise.id,
              sourceDayId: candidate.sourceDayId,
            });
            continue;
          }
          await tx.exercise.create({
            data: {
              dayId: localDayId,
              name: typeof candidate.sourceExercise.name === "string" ? candidate.sourceExercise.name : "",
              description:
                typeof candidate.sourceExercise.description === "string" ? candidate.sourceExercise.description : null,
              sets: Number.isInteger(candidate.sourceExercise.sets) ? candidate.sourceExercise.sets : 0,
              reps: candidate.sourceExercise.reps != null ? String(candidate.sourceExercise.reps) : "",
              targetWeightKg:
                typeof candidate.sourceExercise.target_weight === "number"
                  ? candidate.sourceExercise.target_weight
                  : null,
              restSeconds:
                Number.isInteger(candidate.sourceExercise.rest_seconds) ? candidate.sourceExercise.rest_seconds : null,
              note: typeof candidate.sourceExercise.note === "string" ? candidate.sourceExercise.note : null,
              sortOrder:
                Number.isInteger(candidate.sourceExercise.sort_order) ? candidate.sourceExercise.sort_order : 0,
              imageUrl: typeof candidate.sourceExercise.image_url === "string" ? candidate.sourceExercise.image_url : null,
              legacySupabaseExerciseId: candidate.sourceExercise.id,
              createdAt: toDate(candidate.sourceExercise.created_at) ?? undefined,
            },
          });
          report.created.exercises += 1;
        }

        // 4) AssignedPlan
        const pairSet = new Set(existingAssigned.map((a) => `${a.clientId}::${a.planId}`));
        for (const candidate of assignedCandidatesAfterDedupe) {
          if (candidate.existingAssignedId) continue;
          const localPlanId = planLocalIdBySourcePlanId.get(candidate.sourcePlanId);
          if (!localPlanId) {
            report.skippedConflicts.assignedPlans += 1;
            pushConflict(report, "ASSIGNED_PLAN_LOCAL_ID_UNRESOLVED", {
              sourceAssignedPlanId: candidate.id,
              sourcePlanId: candidate.sourcePlanId,
            });
            continue;
          }
          const pairKey = `${candidate.finalClientId}::${localPlanId}`;
          if (pairSet.has(pairKey)) {
            report.skippedExisting.assignedPlans += 1;
            pushConflict(report, "ASSIGNED_PAIR_ALREADY_EXISTS_LOCALLY", {
              sourceAssignedPlanId: candidate.id,
              finalPairKey: pairKey,
            });
            continue;
          }
          await tx.assignedPlan.create({
            data: {
              clientId: candidate.finalClientId,
              planId: localPlanId,
              assignedAt: toDate(candidate.assigned_at) ?? undefined,
              active: typeof candidate.is_active === "boolean" ? candidate.is_active : true,
              legacySupabaseAssignedPlanId: candidate.id,
            },
          });
          pairSet.add(pairKey);
          report.created.assignedPlans += 1;
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

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`=== Supabase Training ${apply ? "Import" : "Dry-Run"} ===`);
  console.log(`Mode: ${report.mode}`);
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
  console.log("--- Created ---");
  console.log(`plans: ${report.created.plans}`);
  console.log(`days: ${report.created.days}`);
  console.log(`exercises: ${report.created.exercises}`);
  console.log(`assignedPlans: ${report.created.assignedPlans}`);
  console.log("--- Skipped existing ---");
  console.log(`plans: ${report.skippedExisting.plans}`);
  console.log(`days: ${report.skippedExisting.days}`);
  console.log(`exercises: ${report.skippedExisting.exercises}`);
  console.log(`assignedPlans: ${report.skippedExisting.assignedPlans}`);
  console.log("--- Skipped duplicates ---");
  console.log(`assignedPlans: ${report.skippedDuplicates.assignedPlans}`);
  console.log("--- Conflicts by reason ---");
  for (const [code, count] of Object.entries(report.conflictCounts)) {
    console.log(`${code}: ${count}`);
  }
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
  console.error(`Import script failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
