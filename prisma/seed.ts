import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "fadhel.alshadood@gmail.com";
  const plainPassword = "18217799";
  const fullName = "Fadi Alshadood";

  const passwordHash = await bcrypt.hash(plainPassword, 12);

  // Upsert User (match by email, update password + ensure active)
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      authState: "ACTIVE",
      fullName,
    },
    create: {
      email,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      authState: "ACTIVE",
      fullName,
    },
    select: { id: true, email: true, role: true },
  });

  console.log("✓ User:", user.email, "| role:", user.role, "| id:", user.id);

  // Upsert TrainerProfile (match by userId)
  const profile = await prisma.trainerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
    select: { id: true },
  });

  console.log("✓ TrainerProfile id:", profile.id);

  // ── Global drink catalog (trainerId: null) — idempotent ────────────────────
  const globalDrinks: Array<{ name: string; kcalPer100ml: number }> = [
    { name: "Wasser", kcalPer100ml: 0 },
    { name: "Kaffee", kcalPer100ml: 2 },
    { name: "Milch", kcalPer100ml: 61 },
    { name: "Cola Zero", kcalPer100ml: 0 },
    { name: "Red Bull Zero", kcalPer100ml: 3 },
    { name: "Red Bull (mit Zucker)", kcalPer100ml: 46 },
    { name: "Orangensaft", kcalPer100ml: 45 },
    { name: "Apfelsaft", kcalPer100ml: 46 },
  ];

  let createdDrinks = 0;
  for (const d of globalDrinks) {
    const existing = await prisma.drink.findFirst({
      where: { name: d.name, trainerId: null },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.drink.create({
      data: { trainerId: null, name: d.name, kcalPer100ml: d.kcalPer100ml, unit: "ml" },
    });
    createdDrinks += 1;
  }
  console.log(`✓ Global drinks: ${createdDrinks} created, ${globalDrinks.length - createdDrinks} already present.`);

  console.log("Seed complete — trainer login ready.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
