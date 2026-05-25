import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const SENTINEL_PASSWORD_HASH = "MIGRATED_NO_PASSWORD_HASH";
const SENTINEL_AUTH_STATE = "MIGRATED_PASSWORD_REQUIRED";

function usage() {
  console.log(
    "Usage: node scripts/dry-run-import-supabase-clients.mjs backups/supabase/<YYYY-MM-DD-HH-mm>",
  );
}

function normEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function pushAction(actions, type, reason, details) {
  actions.push({ type, reason, ...details });
}

function addConflict(conflicts, code, message, details) {
  conflicts.push({ code, message, ...details });
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function detectDuplicateValues(items, label) {
  const counts = new Map();
  for (const value of items) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const duplicates = [];
  for (const [value, count] of counts.entries()) {
    if (count > 1) duplicates.push({ label, value, count });
  }
  return duplicates;
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const profilesPath = path.join(backupFolder, "profiles.json");
  const clientsPath = path.join(backupFolder, "clients.json");
  const reportPath = path.join(backupFolder, "dry-run-clients-report.json");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
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
    diagnostics: {
      clientsMissingTrainerProfileMapping: [],
      clientsMissingUserProfileMapping: [],
      potentialPrismaUserEmailMatches: [],
      potentialDuplicateLegacyIds: [],
    },
    plannedActions: [],
    conflicts: [],
    summary: {
      wouldCreateUsers: 0,
      wouldUpdateUsers: 0,
      wouldCreateClientProfiles: 0,
      wouldUpdateClientProfiles: 0,
      conflicts: 0,
      skipped: 0,
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
  const profilesByEmail = new Map(
    profiles
      .map((p) => [normEmail(p.email), p])
      .filter(([email]) => email.length > 0),
  );

  report.diagnostics.potentialDuplicateLegacyIds.push(
    ...detectDuplicateValues(
      profiles.map((p) => p.id),
      "profiles.id",
    ),
    ...detectDuplicateValues(
      clients.map((c) => c.id),
      "clients.id",
    ),
    ...detectDuplicateValues(
      clients.map((c) => c.user_id),
      "clients.user_id",
    ),
  );

  const prisma = new PrismaClient();
  let prismaUsers = [];
  let prismaClientProfiles = [];
  let prismaTrainerProfiles = [];

  try {
    prismaUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        legacySupabaseProfileId: true,
      },
    });
    prismaClientProfiles = await prisma.clientProfile.findMany({
      select: {
        id: true,
        email: true,
        userId: true,
        trainerId: true,
        legacySupabaseClientId: true,
        legacySupabaseUserId: true,
      },
    });
    prismaTrainerProfiles = await prisma.trainerProfile.findMany({
      select: { id: true, userId: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.warnings.push(
      `Prisma read failed; report created without DB comparison details: ${message}`,
    );
  } finally {
    await prisma.$disconnect();
  }

  const prismaUsersByLegacy = new Map(
    prismaUsers
      .filter((u) => u.legacySupabaseProfileId)
      .map((u) => [u.legacySupabaseProfileId, u]),
  );
  const prismaUsersByEmail = new Map(
    prismaUsers.map((u) => [normEmail(u.email), u]),
  );
  const prismaTrainerByUserId = new Map(prismaTrainerProfiles.map((tp) => [tp.userId, tp]));
  const prismaClientByLegacyClientId = new Map(
    prismaClientProfiles
      .filter((cp) => cp.legacySupabaseClientId)
      .map((cp) => [cp.legacySupabaseClientId, cp]),
  );

  // Track planned supabase-profile-id => prisma-user planning
  const plannedUserMap = new Map();
  const resolvedTrainerMap = new Map();

  for (const profile of trainerProfiles) {
    const supaId = profile.id;
    const email = normEmail(profile.email);
    const byLegacy = prismaUsersByLegacy.get(supaId);
    const byEmail = prismaUsersByEmail.get(email);

    if (byLegacy) {
      plannedUserMap.set(supaId, byLegacy.id);
      if (byLegacy.role !== "TRAINER") {
        addConflict(report.conflicts, "ROLE_CONFLICT", "Legacy trainer mapped to non-trainer user", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byLegacy.id,
          prismaRole: byLegacy.role,
        });
      } else if (!prismaTrainerByUserId.has(byLegacy.id)) {
        addConflict(report.conflicts, "TRAINER_PROFILE_MISSING", "Trainer user exists but TrainerProfile is missing", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byLegacy.id,
        });
      } else {
        resolvedTrainerMap.set(supaId, byLegacy.id);
        pushAction(report.plannedActions, "skip", "trainer already mapped by legacy id", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byLegacy.id,
        });
        report.summary.skipped += 1;
      }
      continue;
    }

    if (byEmail) {
      report.diagnostics.potentialPrismaUserEmailMatches.push({
        email,
        prismaUserId: byEmail.id,
        prismaRole: byEmail.role,
        supabaseProfileId: supaId,
      });
      plannedUserMap.set(supaId, byEmail.id);

      if (byEmail.role !== "TRAINER") {
        addConflict(report.conflicts, "EMAIL_ROLE_CONFLICT", "Trainer email matches Prisma user with different role", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byEmail.id,
          prismaRole: byEmail.role,
        });
      } else if (byEmail.legacySupabaseProfileId && byEmail.legacySupabaseProfileId !== supaId) {
        addConflict(report.conflicts, "LEGACY_ID_CONFLICT", "Trainer email match has different legacySupabaseProfileId", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byEmail.id,
          existingLegacySupabaseProfileId: byEmail.legacySupabaseProfileId,
        });
      } else if (!prismaTrainerByUserId.has(byEmail.id)) {
        addConflict(report.conflicts, "TRAINER_PROFILE_MISSING", "Trainer email matched user but TrainerProfile is missing", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byEmail.id,
        });
      } else {
        resolvedTrainerMap.set(supaId, byEmail.id);
        pushAction(report.plannedActions, "updateExistingTrainerUserWithLegacy", "match by email", {
          supabaseProfileId: supaId,
          email,
          prismaUserId: byEmail.id,
          setLegacySupabaseProfileId: supaId,
        });
        report.summary.wouldUpdateUsers += 1;
      }
      continue;
    }

    pushAction(report.plannedActions, "createTrainerUser", "no prisma match by legacy id or email", {
      supabaseProfileId: supaId,
      email,
      role: "TRAINER",
      authState: SENTINEL_AUTH_STATE,
      passwordHash: SENTINEL_PASSWORD_HASH,
    });
    report.summary.wouldCreateUsers += 1;
    plannedUserMap.set(supaId, `(planned:new-trainer-user:${supaId})`);
    resolvedTrainerMap.set(supaId, `(planned:new-trainer-user:${supaId})`);
  }

  for (const clientRow of clients) {
    const supaClientId = clientRow.id;
    const trainerProfile = profilesById.get(clientRow.trainer_id);
    const linkedUserProfile = clientRow.user_id ? profilesById.get(clientRow.user_id) : null;

    if (!trainerProfile || trainerProfile.role !== "trainer") {
      report.diagnostics.clientsMissingTrainerProfileMapping.push({
        clientId: supaClientId,
        trainerId: clientRow.trainer_id,
        clientEmail: normEmail(clientRow.email),
      });
      addConflict(report.conflicts, "MISSING_TRAINER_MAPPING", "client.trainer_id cannot be mapped to trainer profile", {
        clientId: supaClientId,
        trainerId: clientRow.trainer_id,
      });
      continue;
    }

    const mappedTrainerUserId = resolvedTrainerMap.get(clientRow.trainer_id);
    if (!mappedTrainerUserId) {
      addConflict(report.conflicts, "MISSING_TRAINER_USER_MAPPING", "trainer profile found but prisma trainer user mapping unresolved", {
        clientId: supaClientId,
        trainerSupabaseProfileId: clientRow.trainer_id,
      });
      continue;
    }

    let mappedClientUser = null;
    if (!linkedUserProfile) {
      report.diagnostics.clientsMissingUserProfileMapping.push({
        clientId: supaClientId,
        userId: clientRow.user_id ?? null,
        clientEmail: normEmail(clientRow.email),
      });
      addConflict(report.conflicts, "MISSING_CLIENT_USER_PROFILE", "client.user_id cannot be mapped to profiles row", {
        clientId: supaClientId,
        userId: clientRow.user_id ?? null,
      });
    } else {
      const linkedSupaUserId = linkedUserProfile.id;
      const linkedEmail = normEmail(linkedUserProfile.email);
      const byLegacy = prismaUsersByLegacy.get(linkedSupaUserId);
      const byEmail = prismaUsersByEmail.get(linkedEmail);

      if (byLegacy) {
        mappedClientUser = byLegacy;
        if (byLegacy.role !== "CLIENT") {
          addConflict(report.conflicts, "ROLE_CONFLICT", "Legacy client user mapped to non-client role", {
            clientId: supaClientId,
            supabaseProfileId: linkedSupaUserId,
            prismaUserId: byLegacy.id,
            prismaRole: byLegacy.role,
          });
        }
      } else if (byEmail) {
        report.diagnostics.potentialPrismaUserEmailMatches.push({
          email: linkedEmail,
          prismaUserId: byEmail.id,
          prismaRole: byEmail.role,
          supabaseProfileId: linkedSupaUserId,
        });
        mappedClientUser = byEmail;
        if (byEmail.role !== "CLIENT") {
          addConflict(report.conflicts, "EMAIL_ROLE_CONFLICT", "Client email matches Prisma user with different role", {
            clientId: supaClientId,
            supabaseProfileId: linkedSupaUserId,
            prismaUserId: byEmail.id,
            prismaRole: byEmail.role,
          });
        } else if (
          byEmail.legacySupabaseProfileId &&
          byEmail.legacySupabaseProfileId !== linkedSupaUserId
        ) {
          addConflict(report.conflicts, "LEGACY_ID_CONFLICT", "Client email match has different legacySupabaseProfileId", {
            clientId: supaClientId,
            supabaseProfileId: linkedSupaUserId,
            prismaUserId: byEmail.id,
            existingLegacySupabaseProfileId: byEmail.legacySupabaseProfileId,
          });
        } else {
          pushAction(
            report.plannedActions,
            "updateExistingClientUserWithLegacy",
            "match by email",
            {
              clientId: supaClientId,
              supabaseProfileId: linkedSupaUserId,
              email: linkedEmail,
              prismaUserId: byEmail.id,
              setLegacySupabaseProfileId: linkedSupaUserId,
            },
          );
          report.summary.wouldUpdateUsers += 1;
        }
      } else {
        pushAction(
          report.plannedActions,
          "createClientUser",
          "no prisma user match by legacy id or email",
          {
            clientId: supaClientId,
            supabaseProfileId: linkedSupaUserId,
            email: linkedEmail,
            role: "CLIENT",
            authState: SENTINEL_AUTH_STATE,
            passwordHash: SENTINEL_PASSWORD_HASH,
          },
        );
        report.summary.wouldCreateUsers += 1;
        mappedClientUser = { id: `(planned:new-client-user:${linkedSupaUserId})`, role: "CLIENT" };
      }
    }

    const existingByLegacyClientId = prismaClientByLegacyClientId.get(supaClientId);
    if (existingByLegacyClientId) {
      pushAction(report.plannedActions, "updateExistingClientProfileByLegacySupabaseClientId", "legacy client id already mapped", {
        clientId: supaClientId,
        prismaClientProfileId: existingByLegacyClientId.id,
        trainerSupabaseProfileId: clientRow.trainer_id,
        linkedSupabaseUserId: clientRow.user_id ?? null,
      });
      report.summary.wouldUpdateClientProfiles += 1;
      continue;
    }

    pushAction(report.plannedActions, "createClientProfile", "no existing ClientProfile found by legacySupabaseClientId", {
      clientId: supaClientId,
      email: normEmail(clientRow.email),
      trainerSupabaseProfileId: clientRow.trainer_id,
      mappedTrainerUserId,
      linkedSupabaseUserId: clientRow.user_id ?? null,
      mappedClientUserId: mappedClientUser?.id ?? null,
    });
    report.summary.wouldCreateClientProfiles += 1;
  }

  report.summary.conflicts = report.conflicts.length;

  await mkdir(backupFolder, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Supabase Clients/Profiles Dry-Run ===");
  console.log(`Backup folder: ${report.backupFolder}`);
  console.log(`Profiles: ${report.sourceCounts.profiles}`);
  console.log(`Clients: ${report.sourceCounts.clients}`);
  console.log(`Trainer profiles: ${report.sourceCounts.trainerProfiles}`);
  console.log(`Client profiles: ${report.sourceCounts.clientProfiles}`);
  console.log(
    `Missing trainer mapping: ${report.diagnostics.clientsMissingTrainerProfileMapping.length}`,
  );
  console.log(
    `Missing user mapping: ${report.diagnostics.clientsMissingUserProfileMapping.length}`,
  );
  console.log(`Would create users: ${report.summary.wouldCreateUsers}`);
  console.log(`Would update users: ${report.summary.wouldUpdateUsers}`);
  console.log(`Would create client profiles: ${report.summary.wouldCreateClientProfiles}`);
  console.log(`Would update client profiles: ${report.summary.wouldUpdateClientProfiles}`);
  console.log(`Conflicts: ${report.summary.conflicts}`);
  console.log(`Skipped: ${report.summary.skipped}`);
  console.log(`Report written: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Dry-run failed: ${message}`);
  process.exitCode = 1;
});
