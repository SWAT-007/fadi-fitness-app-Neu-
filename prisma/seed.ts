import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
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
      role: "TRAINER",
      isActive: true,
      authState: "ACTIVE",
      fullName,
    },
    create: {
      email,
      passwordHash,
      role: "TRAINER",
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
  console.log("Seed complete — trainer login ready.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
