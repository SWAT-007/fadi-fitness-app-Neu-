import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const TABLES = [
  "profiles",
  "clients",
  "workout_plans",
  "workout_days",
  "exercises",
  "assigned_plans",
  "workout_logs",
  "exercise_logs",
  "exercise_change_requests",
  "progress_logs",
  "weekly_checkins",
  "checkin_images",
  "nutrition_plans",
  "nutrition_meals",
  "assigned_nutrition_plans",
  "foods",
  "client_meal_foods",
  "meal_history",
  "meal_logs",
  "drink_logs",
  "recipes",
  "messages",
  "notifications",
];

const PAGE_SIZE = 1000;

function timestampForFolder(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}`;
}

async function exportTableRows(supabase, table) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, to);

    if (error) {
      throw error;
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Missing environment variables. Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const folderName = timestampForFolder();
  const outputDir = path.join(process.cwd(), "backups", "supabase", folderName);
  await mkdir(outputDir, { recursive: true });

  const manifest = {
    exportedAt: new Date().toISOString(),
    outputDir: path.relative(process.cwd(), outputDir),
    tables: [],
  };

  for (const table of TABLES) {
    const filename = `${table}.json`;
    const filePath = path.join(outputDir, filename);

    try {
      const rows = await exportTableRows(supabase, table);
      await writeFile(filePath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

      manifest.tables.push({
        table,
        status: "ok",
        rowCount: rows.length,
        file: filename,
      });

      console.log(`[ok] ${table}: ${rows.length} rows`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      manifest.tables.push({
        table,
        status: "failed",
        rowCount: 0,
        file: null,
        error: message,
      });

      console.warn(`[failed] ${table}: ${message}`);
    }
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const okCount = manifest.tables.filter((t) => t.status === "ok").length;
  const failedCount = manifest.tables.length - okCount;
  console.log(`\nExport done. ok=${okCount}, failed=${failedCount}`);
  console.log(`Manifest: ${path.relative(process.cwd(), manifestPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unexpected error: ${message}`);
  process.exitCode = 1;
});
