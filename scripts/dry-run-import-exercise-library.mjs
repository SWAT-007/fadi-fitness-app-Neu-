import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function usage() {
  console.log(
    "Usage: node scripts/dry-run-import-exercise-library.mjs backups/supabase/<YYYY-MM-DD-HH-mm>",
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

function normalizeName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function detectInputFile(backupFolder) {
  const preferred = path.join(backupFolder, "exercise_library.json");
  try {
    await readFile(preferred, "utf8");
    return { fileName: "exercise_library.json", source: "preferred" };
  } catch {
    // continue
  }

  const manifestPath = path.join(backupFolder, "manifest.json");
  try {
    const manifestRaw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestRaw);
    const tables = Array.isArray(manifest?.tables) ? manifest.tables : [];
    const exerciseLibraryEntry = tables.find(
      (entry) =>
        typeof entry?.table === "string" &&
        entry.table.trim().toLowerCase() === "exercise_library" &&
        typeof entry?.file === "string" &&
        entry.file.trim().length > 0,
    );
    if (exerciseLibraryEntry) {
      return { fileName: exerciseLibraryEntry.file.trim(), source: "manifest" };
    }
  } catch {
    // ignore manifest parse/file issues for detection and continue with candidates
  }

  const candidateFiles = [
    "exercise-library.json",
    "exerciseLibrary.json",
    "exercise_library_export.json",
  ];
  for (const candidate of candidateFiles) {
    try {
      await readFile(path.join(backupFolder, candidate), "utf8");
      return { fileName: candidate, source: "fallback-candidate" };
    } catch {
      // continue
    }
  }

  return null;
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const reportPath = path.join(backupFolder, "dry-run-exercise-library-report.json");

  const detected = await detectInputFile(backupFolder);
  if (!detected) {
    console.error(
      "No exercise library backup file found. Expected exercise_library.json or a manifest entry for table exercise_library.",
    );
    process.exitCode = 1;
    return;
  }

  const inputPath = path.join(backupFolder, detected.fileName);
  let sourceRows;
  try {
    sourceRows = await loadJsonArray(inputPath);
  } catch (error) {
    console.error(
      `Failed to read input JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let existingByName = new Map();
  try {
    const existing = await prisma.exerciseLibrary.findMany({
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
      },
    });
    existingByName = new Map(existing.map((row) => [normalizeName(row.name).toLowerCase(), row]));
  } catch (error) {
    await prisma.$disconnect();
    console.error(
      `Failed Prisma lookup for ExerciseLibrary: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }
  await prisma.$disconnect();

  const duplicateNameMap = new Map();
  for (let i = 0; i < sourceRows.length; i += 1) {
    const source = sourceRows[i];
    const normalized = normalizeName(source?.name).toLowerCase();
    if (!normalized) continue;
    const list = duplicateNameMap.get(normalized) ?? [];
    list.push(i);
    duplicateNameMap.set(normalized, list);
  }

  const duplicateNames = [];
  for (const [normalizedName, indices] of duplicateNameMap.entries()) {
    if (indices.length > 1) {
      duplicateNames.push({
        normalizedName,
        count: indices.length,
        sourceIndices: indices,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    backupFolder: path.relative(process.cwd(), backupFolder),
    inputFile: detected.fileName,
    inputFileDetectedBy: detected.source,
    mapping: {
      name: "name",
      muscle_group: "muscleGroup",
      equipment: "equipment",
      image_url: "imageUrl",
      created_at: "reported_only",
      created_by: "ignored",
    },
    sourceTotals: {
      rows: sourceRows.length,
    },
    counts: {
      importableRows: 0,
      existingByNameRows: 0,
      rowsMissingOrEmptyName: 0,
      imageUrlPresent: 0,
      imageUrlMissing: 0,
      duplicatesByName: duplicateNames.length,
    },
    skippedByReason: {
      MISSING_NAME: 0,
      EXISTING_NAME: 0,
      DUPLICATE_SOURCE_NAME: 0,
    },
    conflictsByReason: {},
    rowsMissingOrEmptyName: [],
    duplicateSourceNames: duplicateNames,
    existingLocalByName: [],
    skippedRows: [],
    createdAtStats: {
      present: 0,
      missing: 0,
    },
  };

  for (let i = 0; i < sourceRows.length; i += 1) {
    const source = sourceRows[i];
    const rawName = source?.name;
    const name = normalizeName(rawName);
    const normalizedName = name.toLowerCase();
    const imageUrl = normalizeStringOrNull(source?.image_url);

    if (imageUrl) {
      report.counts.imageUrlPresent += 1;
    } else {
      report.counts.imageUrlMissing += 1;
    }

    if (source?.created_at) {
      report.createdAtStats.present += 1;
    } else {
      report.createdAtStats.missing += 1;
    }

    if (!name) {
      report.counts.rowsMissingOrEmptyName += 1;
      report.skippedByReason.MISSING_NAME += 1;
      report.skippedRows.push({
        sourceIndex: i,
        sourceId: source?.id ?? null,
        reason: "MISSING_NAME",
      });
      continue;
    }

    const duplicateInfo = duplicateNameMap.get(normalizedName);
    if (duplicateInfo && duplicateInfo.length > 1) {
      report.skippedByReason.DUPLICATE_SOURCE_NAME += 1;
      report.skippedRows.push({
        sourceIndex: i,
        sourceId: source?.id ?? null,
        name,
        reason: "DUPLICATE_SOURCE_NAME",
      });
      continue;
    }

    const existing = existingByName.get(normalizedName);
    if (existing) {
      report.counts.existingByNameRows += 1;
      report.skippedByReason.EXISTING_NAME += 1;
      report.existingLocalByName.push({
        sourceIndex: i,
        sourceId: source?.id ?? null,
        name,
        existingExerciseLibraryId: existing.id,
      });
      continue;
    }

    report.counts.importableRows += 1;
  }

  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("=== ExerciseLibrary Dry-Run Summary ===");
  console.log(`Input file: ${detected.fileName} (${detected.source})`);
  console.log(`Source rows: ${report.sourceTotals.rows}`);
  console.log(`Importable rows: ${report.counts.importableRows}`);
  console.log(`Rows with missing/empty name: ${report.counts.rowsMissingOrEmptyName}`);
  console.log(`Existing local by name: ${report.counts.existingByNameRows}`);
  console.log(`Duplicate source names: ${report.counts.duplicatesByName}`);
  console.log(`Image URL present: ${report.counts.imageUrlPresent}`);
  console.log(`Image URL missing: ${report.counts.imageUrlMissing}`);
  console.log("Skipped by reason:");
  console.log(`- MISSING_NAME: ${report.skippedByReason.MISSING_NAME}`);
  console.log(`- EXISTING_NAME: ${report.skippedByReason.EXISTING_NAME}`);
  console.log(`- DUPLICATE_SOURCE_NAME: ${report.skippedByReason.DUPLICATE_SOURCE_NAME}`);
  console.log(`Report written: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
