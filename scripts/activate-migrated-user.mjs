import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SENTINEL_PASSWORD_HASH = "MIGRATED_NO_PASSWORD_HASH";
const MIN_PASSWORD_LENGTH = 6;

function usage() {
  console.log(
    "Usage: node scripts/activate-migrated-user.mjs <email> <newPassword> [--confirm]",
  );
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function main() {
  const emailArg = process.argv[2];
  const passwordArg = process.argv[3];
  const confirm = process.argv.slice(4).includes("--confirm");

  if (!emailArg || !passwordArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const email = normalizeEmail(emailArg);
  const newPassword = passwordArg;

  if (!email || newPassword.length < MIN_PASSWORD_LENGTH) {
    console.log("Ungültige Eingabe. Passwort muss mindestens 6 Zeichen lang sein.");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        authState: true,
        passwordHash: true,
      },
    });

    if (!user) {
      console.log("Benutzer nicht gefunden.");
      return;
    }

    if (user.authState === "ACTIVE") {
      console.log("Benutzer ist bereits aktiv. Keine Änderung durchgeführt.");
      return;
    }

    if (
      user.authState !== "MIGRATED_PASSWORD_REQUIRED" ||
      user.passwordHash !== SENTINEL_PASSWORD_HASH
    ) {
      console.log("Benutzer hat keinen erwarteten Migrationszustand. Keine Änderung durchgeführt.");
      return;
    }

    if (!confirm) {
      console.log("Dry-run: Keine Änderungen geschrieben.");
      console.log(`Würde Benutzer aktivieren: ${user.email}`);
      console.log(`Rolle bleibt unverändert: ${user.role}`);
      console.log("Würde setzen: authState=ACTIVE, passwordHash=<bcrypt-hash>");
      console.log("Für echte Ausführung --confirm anhängen.");
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        authState: "ACTIVE",
      },
    });

    console.log(`Benutzer aktiviert: ${user.email}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Fehler: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
