import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function usage() {
  console.log(
    "Usage: node scripts/import-exercise-library.mjs backups/supabase/<YYYY-MM-DD-HH-mm> [--apply --confirm]",
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
    // continue
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

function buildDuplicateMap(sourceRows) {
  const duplicateNameMap = new Map();
  for (let i = 0; i < sourceRows.length; i += 1) {
    const source = sourceRows[i];
    const normalized = normalizeName(source?.name).toLowerCase();
    if (!normalized) continue;
    const list = duplicateNameMap.get(normalized) ?? [];
    list.push(i);
    duplicateNameMap.set(normalized, list);
  }
  return duplicateNameMap;
}

async function main() {
  const folderArg = process.argv[2];
  if (!folderArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const args = new Set(process.argv.slice(3));
  const applyMode = args.has("--apply") && args.has("--confirm");
  const mode = applyMode ? "apply" : "dry-run";

  const backupFolder = path.resolve(process.cwd(), folderArg);
  const reportPath = path.join(backupFolder, "import-exercise-library-report.json");

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

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    backupFolder: path.relative(process.cwd(), backupFolder),
    inputFile: detected.fileName,
    inputFileDetectedBy: detected.source,
    mapping: {
      name: "name",
      muscle_group: "muscleGroup",
      equipment: "equipment",
      image_url: "imageUrl",
      created_by: "ignored",
      created_at: "ignored",
    },
    sourceTotals: {
      rows: sourceRows.length,
    },
    counts: {
      importableRows: 0,
      createdRows: 0,
      skippedExistingByName: 0,
      skippedDuplicateSourceName: 0,
      skippedMissingName: 0,
      imageUrlPresent: 0,
      imageUrlMissing: 0,
    },
    skippedRows: [],
    duplicateSourceNames: [],
    existingLocalByName: [],
    errors: [],
  };

  try {
    const existingRows = await prisma.exerciseLibrary.findMany({
      select: {
        id: true,
        name: true,
      },
    });
    const existingByName = new Map(
      existingRows.map((row) => [normalizeName(row.name).toLowerCase(), row]),
    );

    const duplicateNameMap = buildDuplicateMap(sourceRows);
    for (const [normalizedName, indices] of duplicateNameMap.entries()) {
      if (indices.length > 1) {
        report.duplicateSourceNames.push({
          normalizedName,
          count: indices.length,
          sourceIndices: indices,
        });
      }
    }

    const createPayloads = [];

    for (let i = 0; i < sourceRows.length; i += 1) {
      const source = sourceRows[i];
      const name = normalizeName(source?.name);
      const normalizedName = name.toLowerCase();
      const imageUrl = normalizeStringOrNull(source?.image_url);

      if (imageUrl) {
        report.counts.imageUrlPresent += 1;
      } else {
        report.counts.imageUrlMissing += 1;
      }

      if (!name) {
        report.counts.skippedMissingName += 1;
        report.skippedRows.push({
          sourceIndex: i,
          sourceId: source?.id ?? null,
          reason: "MISSING_NAME",
        });
        continue;
      }

      const duplicateInfo = duplicateNameMap.get(normalizedName);
      if (duplicateInfo && duplicateInfo.length > 1) {
        report.counts.skippedDuplicateSourceName += 1;
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
        report.counts.skippedExistingByName += 1;
        report.existingLocalByName.push({
          sourceIndex: i,
          sourceId: source?.id ?? null,
          name,
          existingExerciseLibraryId: existing.id,
        });
        continue;
      }

      report.counts.importableRows += 1;
      createPayloads.push({
        sourceIndex: i,
        sourceId: source?.id ?? null,
        data: {
          name,
          muscleGroup: normalizeStringOrNull(source?.muscle_group),
          equipment: normalizeStringOrNull(source?.equipment),
          imageUrl,
        },
      });
    }

    if (applyMode && createPayloads.length > 0) {
      await prisma.$transaction(
        createPayloads.map((item) =>
          prisma.exerciseLibrary.create({
            data: item.data,
            select: { id: true },
          }),
        ),
      );
      report.counts.createdRows = createPayloads.length;
    }

    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    try {
      await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    } catch {
      // ignore secondary write failures
    }
    console.error(`Import script failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  } finally {
    await prisma.$disconnect();
  }

  console.log("=== ExerciseLibrary Import Summary ===");
  console.log(`Mode: ${report.mode}`);
  console.log(`Input file: ${report.inputFile} (${report.inputFileDetectedBy})`);
  console.log(`Source rows: ${report.sourceTotals.rows}`);
  console.log(`Importable rows: ${report.counts.importableRows}`);
  console.log(`Created rows: ${report.counts.createdRows}`);
  console.log(`Skipped existing by name: ${report.counts.skippedExistingByName}`);
  console.log(`Skipped duplicate source names: ${report.counts.skippedDuplicateSourceName}`);
  console.log(`Skipped missing/empty name: ${report.counts.skippedMissingName}`);
  console.log(`Image URL present: ${report.counts.imageUrlPresent}`);
  console.log(`Image URL missing: ${report.counts.imageUrlMissing}`);
  console.log(`Report written: ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
