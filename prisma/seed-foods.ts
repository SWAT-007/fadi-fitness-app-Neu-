import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Default: DATABASE_URL (local). Set TARGET_DATABASE_URL to seed Railway instead.
const DB_URL = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: Neither TARGET_DATABASE_URL nor DATABASE_URL is set.");
  process.exit(1);
}

// The trainer that owns these standard foods.
// Override with SEED_TRAINER_EMAIL for Railway if needed.
const TRAINER_EMAIL = process.env.SEED_TRAINER_EMAIL ?? "fadhel.alshadood@gmail.com";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });

// Category mapping: German label → Prisma FoodCategory string
const CAT: Record<string, string> = {
  "Proteinquelle":      "protein",
  "Kohlenhydratquelle": "carbs",
  "Fettquelle":         "fat",
  "Gemüse":             "vegetable",
};

// name | category (German) | kcal | protein | carbs | fat  — all per 100 g
const SEED: [string, string, number, number, number, number][] = [
  ["Apfel",                     "Kohlenhydratquelle",  65,  0.3,  14.4,  0.1],
  ["Avocado",                   "Fettquelle",         138,  1.4,   3.6, 12.5],
  ["Banane",                    "Kohlenhydratquelle",  93,  1.2,  20.0,  0.2],
  ["Brokkoli",                  "Gemüse",              34,  2.8,   7.0,  0.4],
  ["Butter",                    "Fettquelle",         741,  0.7,   0.6, 83.2],
  ["Cashewkerne",               "Fettquelle",         598, 21.0,  22.2, 47.1],
  ["Champignons",               "Gemüse",              22,  3.1,   3.3,  0.3],
  ["Datteln",                   "Kohlenhydratquelle", 297,  2.0,  65.0,  0.5],
  ["Eier gekocht",              "Proteinquelle",      137, 11.9,   1.5,  9.3],
  ["Eiweiß Eiklar",            "Proteinquelle",       48, 11.1,   0.7,  0.1],
  ["Erdnussbutter",             "Fettquelle",         638, 22.6,  12.2, 53.7],
  ["Gurke",                     "Gemüse",              16,  0.7,   3.6,  0.1],
  ["Haferflocken",              "Kohlenhydratquelle", 373, 13.2,  59.5,  6.7],
  ["Hähnchenbrust gegrillt",   "Proteinquelle",      112, 23.0,   1.0,  2.0],
  ["Hähnchenbrust roh",        "Proteinquelle",      102, 23.6,   0.0,  0.7],
  ["Karotten",                  "Gemüse",              41,  0.9,   9.6,  0.2],
  ["Kartoffeln gekocht",        "Kohlenhydratquelle", 113,  1.6,  23.2,  0.6],
  ["Lachs gebraten",            "Proteinquelle",      198, 22.4,   0.0, 12.2],
  ["Lachs roh",                 "Proteinquelle",      131, 18.0,   0.0,  6.3],
  ["Mandeln",                   "Fettquelle",         611, 24.0,   5.7, 53.0],
  ["Olivenöl",                  "Fettquelle",         884,  0.0,   0.2,100.0],
  ["Paprika",                   "Gemüse",              31,  1.0,   6.0,  0.3],
  ["Putenbrust gebraten",       "Proteinquelle",      155, 20.9,   0.4,  7.7],
  ["Putenbrust roh",            "Proteinquelle",      114, 24.0,   0.0,  1.0],
  ["Reis gekocht",              "Kohlenhydratquelle", 132,  3.3,  28.1,  0.4],
  ["Reis roh",                  "Kohlenhydratquelle", 355,  7.4,  76.8,  1.1],
  ["Rindfleisch mager gebraten","Proteinquelle",      217, 26.0,   0.0, 12.0],
  ["Rindfleisch mager roh",     "Proteinquelle",      103, 21.0,   0.0,  4.0],
  ["Skyr",                      "Proteinquelle",       63, 10.6,   4.0,  0.2],
  ["Spinat",                    "Gemüse",              23,  2.9,   3.6,  0.4],
  ["Süßkartoffeln gekocht",    "Kohlenhydratquelle", 113,  1.6,  23.2,  0.6],
  ["Thunfisch im Wasser",       "Proteinquelle",      100, 22.9,   0.8,  0.4],
  ["Tomaten",                   "Gemüse",              18,  0.9,   3.9,  0.2],
  ["Topfen 0,2% Fett",          "Proteinquelle",       72, 14.0,   4.1,  0.2],
  ["Vollkornnudeln gekocht",    "Kohlenhydratquelle", 150,  6.0,  30.0,  1.0],
  ["Walnüsse",                  "Fettquelle",         654, 15.0,  14.0, 65.0],
  ["Whey Protein Pulver",       "Proteinquelle",      400, 80.0,   8.0,  6.0],
  ["Zucchini",                  "Gemüse",              17,  1.2,   3.1,  0.3],
];

async function main() {
  const isRailway = !!process.env.TARGET_DATABASE_URL;
  const target = isRailway ? "Railway (TARGET_DATABASE_URL)" : "lokal (DATABASE_URL)";
  console.log(`Ziel: ${target}`);
  console.log(`Trainer-E-Mail: ${TRAINER_EMAIL}\n`);

  // 1. Trainer-User finden
  const user = await db.user.findUnique({
    where: { email: TRAINER_EMAIL },
    select: { id: true, email: true },
  });
  if (!user) {
    console.error(`ERROR: User mit E-Mail "${TRAINER_EMAIL}" nicht gefunden.`);
    console.error("Tipp: SEED_TRAINER_EMAIL=andere@email.com npx.cmd tsx prisma/seed-foods.ts");
    process.exit(1);
  }
  console.log(`User gefunden: ${user.email} (${user.id})`);

  // 2. TrainerProfile finden
  const trainerProfile = await db.trainerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!trainerProfile) {
    console.error(`ERROR: Kein TrainerProfile für User "${TRAINER_EMAIL}" gefunden.`);
    process.exit(1);
  }
  console.log(`TrainerProfile: ${trainerProfile.id}\n`);

  // 3. Upsert by name — assign trainerId
  let created = 0;
  let updated = 0;

  for (const [name, catDe, kcal, protein, carbs, fat] of SEED) {
    const category = CAT[catDe] ?? "other";
    const data = {
      name,
      category,
      caloriesPer100g:      kcal,
      proteinPer100g:       protein,
      carbsPer100g:         carbs,
      fatPer100g:           fat,
      defaultServingG:      100,
      source:               "standard_seed",
      trainerId:            trainerProfile.id,
      unit:                 null as string | null,
      brand:                null as string | null,
      barcode:              null as string | null,
      legacySupabaseFoodId: null as string | null,
    };

    // findFirst by name (no unique constraint on name, so manual upsert)
    const existing = await db.food.findFirst({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      await db.food.update({ where: { id: existing.id }, data });
      console.log(`  ↻  ${name}`);
      updated++;
    } else {
      await db.food.create({ data });
      console.log(`  +  ${name}`);
      created++;
    }
  }

  console.log(`\nFertig. Neu: ${created} | Aktualisiert: ${updated} | Gesamt: ${SEED.length}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
