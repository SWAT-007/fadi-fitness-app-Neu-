import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SENTINEL_PASSWORD_HASH = "MIGRATED_NO_PASSWORD_HASH";
const SENTINEL_AUTH_STATE = "MIGRATED_PASSWORD_REQUIRED";

function usage() {
  console.log(
    "Usage: node scripts/import-supabase-clients.mjs backups/supabase/<YYYY-MM-DD-HH-mm> [--apply --confirm]",
  );
}

function normEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function addConflict(report, code, message, details) {
  report.conflicts.push({ code, message, ...details });
}

function planSkip(report, reason, details) {
  report.skipped.push({ reason, ...details });
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const folderArg = process.argv[2];
  const flags = new Set(process.argv.slice(3));
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const applyRequested = flags.has("--apply") && flags.has("--confirm");
  const mode = applyRequested ? "apply" : "dry-run";

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const profilesPath = path.join(backupFolder, "profiles.json");
  const clientsPath = path.join(backupFolder, "clients.json");
  const reportPath = path.join(backupFolder, "import-clients-report.json");

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    backupFolder: path.relative(process.cwd(), backupFolder),
    sentinel: {
      passwordHash: SENTINEL_PASSWORD_HASH,
      authState: SENTINEL_AUTH_STATE,
    },
    sourceCounts: {
      profiles: 0,
      clients: 0,
      trainerProfiles: 0,
      clientProfiles: 0,
    },
    createdUsers: [],
    updatedUsers: [],
    createdTrainerProfiles: [],
    createdClientProfiles: [],
    updatedClientProfiles: [],
    skipped: [],
    conflicts: [],
    summary: {
      createdUsers: 0,
      updatedUsers: 0,
      createdTrainerProfiles: 0,
      createdClientProfiles: 0,
      updatedClientProfiles: 0,
      skipped: 0,
      conflicts: 0,
    },
    warnings: [],
  };

  let profiles;
  let clients;
  try {
    profiles = await loadJson(profilesPath);
    clients = await loadJson(clientsPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read backup JSON files: ${message}`);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(profiles) || !Array.isArray(clients)) {
    console.error("profiles.json and clients.json must be JSON arrays.");
    process.exitCode = 1;
    return;
  }

  report.sourceCounts.profiles = profiles.length;
  report.sourceCounts.clients = clients.length;

  const trainerProfiles = profiles.filter((p) => p?.role === "trainer");
  const clientProfiles = profiles.filter((p) => p?.role === "client");
  report.sourceCounts.trainerProfiles = trainerProfiles.length;
  report.sourceCounts.clientProfiles = clientProfiles.length;

  const profilesById = new Map(profiles.map((p) => [p.id, p]));

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const applyOps = [];

    const prismaUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        passwordHash: true,
        authState: true,
        legacySupabaseProfileId: true,
      },
    });
    const prismaTrainers = await prisma.trainerProfile.findMany({
      select: { id: true, userId: true },
    });
    const prismaClients = await prisma.clientProfile.findMany({
      select: {
        id: true,
        userId: true,
        trainerId: true,
        email: true,
        legacySupabaseClientId: true,
        legacySupabaseUserId: true,
      },
    });

    const usersByLegacy = new Map(
      prismaUsers.filter((u) => u.legacySupabaseProfileId).map((u) => [u.legacySupabaseProfileId, u]),
    );
    const usersByEmail = new Map(prismaUsers.map((u) => [normEmail(u.email), u]));
    const trainerByUserId = new Map(prismaTrainers.map((t) => [t.userId, t]));
    const clientsByLegacyClientId = new Map(
      prismaClients.filter((c) => c.legacySupabaseClientId).map((c) => [c.legacySupabaseClientId, c]),
    );

    // Supabase profile id -> planned/resolved prisma user id
    const resolvedUserBySupaProfileId = new Map();
    // Supabase trainer profile id -> planned/resolved prisma trainerProfile id
    const resolvedTrainerProfileIdBySupaProfileId = new Map();

    for (const profile of trainerProfiles) {
      const supaProfileId = profile.id;
      const email = normEmail(profile.email);
      const fullName = profile.full_name?.trim() || "Trainer";

      const byLegacy = usersByLegacy.get(supaProfileId);
      if (byLegacy) {
        if (byLegacy.role !== "TRAINER") {
          addConflict(report, "ROLE_CONFLICT", "Legacy trainer mapped to non-trainer user", {
            supabaseProfileId: supaProfileId,
            email,
            prismaUserId: byLegacy.id,
            prismaRole: byLegacy.role,
          });
          planSkip(report, "trainer-role-conflict", { supabaseProfileId: supaProfileId, email });
          continue;
        }
        resolvedUserBySupaProfileId.set(supaProfileId, byLegacy.id);
        const existingTrainer = trainerByUserId.get(byLegacy.id);
        if (existingTrainer) {
          resolvedTrainerProfileIdBySupaProfileId.set(supaProfileId, existingTrainer.id);
          planSkip(report, "trainer-already-mapped", {
            supabaseProfileId: supaProfileId,
            prismaUserId: byLegacy.id,
            prismaTrainerProfileId: existingTrainer.id,
          });
        } else {
          const plannedTrainerId = `(planned:trainer-profile:${byLegacy.id})`;
          resolvedTrainerProfileIdBySupaProfileId.set(supaProfileId, plannedTrainerId);
          report.createdTrainerProfiles.push({ supabaseProfileId: supaProfileId, prismaUserId: byLegacy.id });
          applyOps.push({
            type: "createTrainerProfile",
            data: { userId: byLegacy.id },
          });
        }
        continue;
      }

      const byEmail = usersByEmail.get(email);
      if (byEmail) {
        if (byEmail.role !== "TRAINER") {
          addConflict(report, "EMAIL_ROLE_CONFLICT", "Trainer email matches Prisma user with different role", {
            supabaseProfileId: supaProfileId,
            email,
            prismaUserId: byEmail.id,
            prismaRole: byEmail.role,
          });
          planSkip(report, "trainer-email-role-conflict", { supabaseProfileId: supaProfileId, email });
          continue;
        }
        if (byEmail.legacySupabaseProfileId && byEmail.legacySupabaseProfileId !== supaProfileId) {
          addConflict(report, "LEGACY_ID_CONFLICT", "Trainer email match has different legacySupabaseProfileId", {
            supabaseProfileId: supaProfileId,
            email,
            prismaUserId: byEmail.id,
            existingLegacySupabaseProfileId: byEmail.legacySupabaseProfileId,
          });
          planSkip(report, "trainer-legacy-conflict", { supabaseProfileId: supaProfileId, email });
          continue;
        }

        resolvedUserBySupaProfileId.set(supaProfileId, byEmail.id);
        report.updatedUsers.push({
          supabaseProfileId: supaProfileId,
          prismaUserId: byEmail.id,
          action: "setLegacySupabaseProfileId",
        });
        applyOps.push({
          type: "updateUserLegacyById",
          data: { userId: byEmail.id, legacySupabaseProfileId: supaProfileId },
        });

        const existingTrainer = trainerByUserId.get(byEmail.id);
        if (existingTrainer) {
          resolvedTrainerProfileIdBySupaProfileId.set(supaProfileId, existingTrainer.id);
        } else {
          const plannedTrainerId = `(planned:trainer-profile:${byEmail.id})`;
          resolvedTrainerProfileIdBySupaProfileId.set(supaProfileId, plannedTrainerId);
          report.createdTrainerProfiles.push({ supabaseProfileId: supaProfileId, prismaUserId: byEmail.id });
          applyOps.push({
            type: "createTrainerProfile",
            data: { userId: byEmail.id },
          });
        }
        continue;
      }

      const plannedUserId = `(planned:new-user:${supaProfileId})`;
      const plannedTrainerId = `(planned:trainer-profile:${plannedUserId})`;
      resolvedUserBySupaProfileId.set(supaProfileId, plannedUserId);
      resolvedTrainerProfileIdBySupaProfileId.set(supaProfileId, plannedTrainerId);

      report.createdUsers.push({
        supabaseProfileId: supaProfileId,
        email,
        role: "TRAINER",
        authState: SENTINEL_AUTH_STATE,
      });
      applyOps.push({
        type: "createUser",
        data: {
          email,
          role: "TRAINER",
          fullName,
          legacySupabaseProfileId: supaProfileId,
        },
      });
      report.createdTrainerProfiles.push({ supabaseProfileId: supaProfileId, prismaUserId: plannedUserId });
      applyOps.push({
        type: "createTrainerProfile",
        data: { userIdRefSupabaseProfileId: supaProfileId },
      });
    }

    for (const clientRow of clients) {
      const supaClientId = clientRow.id;
      const clientEmail = normEmail(clientRow.email);
      const fullName = clientRow.full_name?.trim() || "Client";
      const trainerSupaProfileId = clientRow.trainer_id;
      const linkedSupaUserProfileId = clientRow.user_id ?? null;

      const trainerProfile = profilesById.get(trainerSupaProfileId);
      if (!trainerProfile || trainerProfile.role !== "trainer") {
        addConflict(report, "MISSING_TRAINER_MAPPING", "client.trainer_id cannot be mapped to trainer profile", {
          supabaseClientId: supaClientId,
          trainerSupabaseProfileId: trainerSupaProfileId,
          email: clientEmail,
        });
        planSkip(report, "client-missing-trainer-mapping", {
          supabaseClientId: supaClientId,
          trainerSupabaseProfileId: trainerSupaProfileId,
          email: clientEmail,
        });
        continue;
      }

      const mappedTrainerProfileId = resolvedTrainerProfileIdBySupaProfileId.get(trainerSupaProfileId);
      if (!mappedTrainerProfileId) {
        addConflict(report, "MISSING_TRAINER_PROFILE_ID", "trainer mapping unresolved for client row", {
          supabaseClientId: supaClientId,
          trainerSupabaseProfileId: trainerSupaProfileId,
          email: clientEmail,
        });
        planSkip(report, "client-trainer-unresolved", {
          supabaseClientId: supaClientId,
          trainerSupabaseProfileId: trainerSupaProfileId,
          email: clientEmail,
        });
        continue;
      }

      let mappedClientUserId = null;
      if (!linkedSupaUserProfileId) {
        addConflict(report, "MISSING_CLIENT_USER_PROFILE", "client.user_id is missing", {
          supabaseClientId: supaClientId,
          email: clientEmail,
        });
        planSkip(report, "client-missing-user-id", { supabaseClientId: supaClientId, email: clientEmail });
        continue;
      }

      const linkedProfile = profilesById.get(linkedSupaUserProfileId);
      if (!linkedProfile) {
        addConflict(report, "MISSING_CLIENT_USER_PROFILE", "client.user_id not found in profiles.json", {
          supabaseClientId: supaClientId,
          supabaseUserProfileId: linkedSupaUserProfileId,
          email: clientEmail,
        });
        planSkip(report, "client-user-profile-not-found", {
          supabaseClientId: supaClientId,
          supabaseUserProfileId: linkedSupaUserProfileId,
          email: clientEmail,
        });
        continue;
      }

      const linkedEmail = normEmail(linkedProfile.email);
      const userByLegacy = usersByLegacy.get(linkedSupaUserProfileId);
      const userByEmail = usersByEmail.get(linkedEmail);

      if (userByLegacy) {
        if (userByLegacy.role !== "CLIENT") {
          addConflict(report, "ROLE_CONFLICT", "Legacy client user mapped to non-client role", {
            supabaseClientId: supaClientId,
            supabaseUserProfileId: linkedSupaUserProfileId,
            email: linkedEmail,
            prismaUserId: userByLegacy.id,
            prismaRole: userByLegacy.role,
          });
          planSkip(report, "client-user-role-conflict", {
            supabaseClientId: supaClientId,
            supabaseUserProfileId: linkedSupaUserProfileId,
            email: linkedEmail,
          });
          continue;
        }
        mappedClientUserId = userByLegacy.id;
      } else if (userByEmail) {
        if (userByEmail.role !== "CLIENT") {
          addConflict(report, "EMAIL_ROLE_CONFLICT", "Client email matches Prisma user with different role", {
            supabaseClientId: supaClientId,
            supabaseUserProfileId: linkedSupaUserProfileId,
            email: linkedEmail,
            prismaUserId: userByEmail.id,
            prismaRole: userByEmail.role,
          });
          planSkip(report, "client-email-role-conflict", {
            supabaseClientId: supaClientId,
            supabaseUserProfileId: linkedSupaUserProfileId,
            email: linkedEmail,
          });
          continue;
        }
        if (
          userByEmail.legacySupabaseProfileId &&
          userByEmail.legacySupabaseProfileId !== linkedSupaUserProfileId
        ) {
          addConflict(report, "LEGACY_ID_CONFLICT", "Client email match has different legacySupabaseProfileId", {
            supabaseClientId: supaClientId,
            supabaseUserProfileId: linkedSupaUserProfileId,
            email: linkedEmail,
            prismaUserId: userByEmail.id,
            existingLegacySupabaseProfileId: userByEmail.legacySupabaseProfileId,
          });
          planSkip(report, "client-legacy-conflict", {
            supabaseClientId: supaClientId,
            supabaseUserProfileId: linkedSupaUserProfileId,
            email: linkedEmail,
          });
          continue;
        }
        mappedClientUserId = userByEmail.id;
        report.updatedUsers.push({
          supabaseProfileId: linkedSupaUserProfileId,
          prismaUserId: userByEmail.id,
          action: "setLegacySupabaseProfileId",
        });
        applyOps.push({
          type: "updateUserLegacyById",
          data: { userId: userByEmail.id, legacySupabaseProfileId: linkedSupaUserProfileId },
        });
      } else {
        const plannedUserId = `(planned:new-user:${linkedSupaUserProfileId})`;
        mappedClientUserId = plannedUserId;
        report.createdUsers.push({
          supabaseProfileId: linkedSupaUserProfileId,
          email: linkedEmail,
          role: "CLIENT",
          authState: SENTINEL_AUTH_STATE,
        });
        applyOps.push({
          type: "createUser",
          data: {
            email: linkedEmail,
            role: "CLIENT",
            fullName: linkedProfile.full_name?.trim() || fullName,
            legacySupabaseProfileId: linkedSupaUserProfileId,
          },
        });
      }

      const existingByLegacyClientId = clientsByLegacyClientId.get(supaClientId);
      if (existingByLegacyClientId) {
        report.updatedClientProfiles.push({
          supabaseClientId: supaClientId,
          prismaClientProfileId: existingByLegacyClientId.id,
          action: "updateByLegacySupabaseClientId",
        });
        applyOps.push({
          type: "upsertClientProfile",
          data: {
            supabaseClientId: supaClientId,
            trainerProfileRef: trainerSupaProfileId,
            userProfileRef: linkedSupaUserProfileId,
            fullName,
            email: clientEmail,
            phone: clientRow.phone ?? null,
            notes: clientRow.notes ?? null,
          },
        });
      } else {
        report.createdClientProfiles.push({
          supabaseClientId: supaClientId,
          trainerSupabaseProfileId: trainerSupaProfileId,
          supabaseUserProfileId: linkedSupaUserProfileId,
          email: clientEmail,
        });
        applyOps.push({
          type: "upsertClientProfile",
          data: {
            supabaseClientId: supaClientId,
            trainerProfileRef: trainerSupaProfileId,
            userProfileRef: linkedSupaUserProfileId,
            fullName,
            email: clientEmail,
            phone: clientRow.phone ?? null,
            notes: clientRow.notes ?? null,
          },
        });
      }
    }

    if (applyRequested) {
      await prisma.$transaction(async (tx) => {
        const resolvedUsers = new Map();
        const resolvedTrainerProfiles = new Map();

        for (const op of applyOps) {
          if (op.type === "createUser") {
            const created = await tx.user.create({
              data: {
                email: op.data.email,
                passwordHash: SENTINEL_PASSWORD_HASH,
                role: op.data.role,
                authState: SENTINEL_AUTH_STATE,
                fullName: op.data.fullName,
                legacySupabaseProfileId: op.data.legacySupabaseProfileId,
              },
              select: { id: true, legacySupabaseProfileId: true },
            });
            resolvedUsers.set(op.data.legacySupabaseProfileId, created.id);
          }
        }

        for (const op of applyOps) {
          if (op.type === "updateUserLegacyById") {
            await tx.user.update({
              where: { id: op.data.userId },
              data: { legacySupabaseProfileId: op.data.legacySupabaseProfileId },
            });
            resolvedUsers.set(op.data.legacySupabaseProfileId, op.data.userId);
          }
        }

        for (const op of applyOps) {
          if (op.type === "createTrainerProfile") {
            const userId =
              op.data.userId ??
              resolvedUsers.get(op.data.userIdRefSupabaseProfileId);
            if (!userId) {
              throw new Error(
                `Missing resolved user for trainer profile ${op.data.userIdRefSupabaseProfileId}`,
              );
            }
            const trainer = await tx.trainerProfile.upsert({
              where: { userId },
              create: { userId },
              update: {},
              select: { id: true, userId: true },
            });
            const key = op.data.userIdRefSupabaseProfileId ?? null;
            if (key) resolvedTrainerProfiles.set(key, trainer.id);
          }
        }

        for (const op of applyOps) {
          if (op.type === "upsertClientProfile") {
            const trainerProfileId =
              resolvedTrainerProfiles.get(op.data.trainerProfileRef) ??
              (
                await tx.trainerProfile.findFirst({
                  where: {
                    user: { legacySupabaseProfileId: op.data.trainerProfileRef },
                  },
                  select: { id: true },
                })
              )?.id;
            const clientUserId =
              resolvedUsers.get(op.data.userProfileRef) ??
              (
                await tx.user.findFirst({
                  where: { legacySupabaseProfileId: op.data.userProfileRef },
                  select: { id: true },
                })
              )?.id ??
              null;

            if (!trainerProfileId) {
              throw new Error(
                `Missing resolved trainer profile for supabase profile ${op.data.trainerProfileRef}`,
              );
            }

            await tx.clientProfile.upsert({
              where: {
                legacySupabaseClientId: op.data.supabaseClientId,
              },
              create: {
                trainerId: trainerProfileId,
                userId: clientUserId,
                fullName: op.data.fullName,
                email: op.data.email,
                phone: op.data.phone,
                notes: op.data.notes,
                legacySupabaseClientId: op.data.supabaseClientId,
                legacySupabaseUserId: op.data.userProfileRef,
              },
              update: {
                trainerId: trainerProfileId,
                userId: clientUserId,
                fullName: op.data.fullName,
                email: op.data.email,
                phone: op.data.phone,
                notes: op.data.notes,
                legacySupabaseUserId: op.data.userProfileRef,
              },
            });
          }
        }
      });
    }

    report.summary.createdUsers = report.createdUsers.length;
    report.summary.updatedUsers = report.updatedUsers.length;
    report.summary.createdTrainerProfiles = report.createdTrainerProfiles.length;
    report.summary.createdClientProfiles = report.createdClientProfiles.length;
    report.summary.updatedClientProfiles = report.updatedClientProfiles.length;
    report.summary.skipped = report.skipped.length;
    report.summary.conflicts = report.conflicts.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.warnings.push(`Execution error: ${message}`);
    console.error(`Import analysis failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  await mkdir(backupFolder, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Supabase Clients/Profiles Import Report ===");
  console.log(`Mode: ${report.mode}`);
  console.log(`Profiles: ${report.sourceCounts.profiles}`);
  console.log(`Clients: ${report.sourceCounts.clients}`);
  console.log(`Created users: ${report.summary.createdUsers}`);
  console.log(`Updated users: ${report.summary.updatedUsers}`);
  console.log(`Created trainer profiles: ${report.summary.createdTrainerProfiles}`);
  console.log(`Created client profiles: ${report.summary.createdClientProfiles}`);
  console.log(`Updated client profiles: ${report.summary.updatedClientProfiles}`);
  console.log(`Conflicts: ${report.summary.conflicts}`);
  console.log(`Skipped: ${report.summary.skipped}`);
  console.log(`Report written: ${path.relative(process.cwd(), reportPath)}`);

  if (!applyRequested) {
    console.log("No writes executed. Use --apply --confirm to perform import.");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Import failed: ${message}`);
  process.exitCode = 1;
});
