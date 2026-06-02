import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TRAINER_EMAIL = "fadhel.alshadood@gmail.com";
const KAMILLA_EMAIL = "kamilla.suele@gmail.com";
const KAMILLA_NAME = "Kamilla Suele";
const KAMILLA_PASSWORD = "Test1234!";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    // ── Vorbereitung: Trainer-IDs zur Laufzeit ermitteln ──────────────────────
    const trainerUser = await prisma.user.findUnique({
      where: { email: TRAINER_EMAIL },
      select: { id: true, email: true },
    });
    if (!trainerUser) {
      console.log(`Trainer-User '${TRAINER_EMAIL}' nicht gefunden. Abbruch.`);
      process.exitCode = 1;
      return;
    }

    const trainerProfile = await prisma.trainerProfile.findFirst({
      where: { user: { email: TRAINER_EMAIL } },
      select: { id: true },
    });
    if (!trainerProfile) {
      console.log(`TrainerProfile für '${TRAINER_EMAIL}' nicht gefunden. Abbruch.`);
      process.exitCode = 1;
      return;
    }

    console.log("✓ Trainer User.id:        ", trainerUser.id);
    console.log("✓ Trainer TrainerProfile.id:", trainerProfile.id);

    // ── SCHRITT 1: User (Kamilla) ─────────────────────────────────────────────
    let kamilla = await prisma.user.findUnique({
      where: { email: KAMILLA_EMAIL },
      select: { id: true, email: true, role: true },
    });
    if (kamilla) {
      console.log("• User existiert bereits, überspringe:", kamilla.id);
    } else {
      const passwordHash = await bcrypt.hash(KAMILLA_PASSWORD, 12);
      kamilla = await prisma.user.create({
        data: {
          email: KAMILLA_EMAIL,
          passwordHash,
          role: "CLIENT",
          fullName: KAMILLA_NAME,
          isActive: true,
          authState: "ACTIVE",
        },
        select: { id: true, email: true, role: true },
      });
      console.log("✓ User angelegt:", kamilla.id);
    }

    // ── SCHRITT 2: ClientProfile ──────────────────────────────────────────────
    let clientProfile = await prisma.clientProfile.findUnique({
      where: { userId: kamilla.id },
      select: { id: true },
    });
    if (clientProfile) {
      console.log("• ClientProfile existiert bereits, überspringe:", clientProfile.id);
    } else {
      clientProfile = await prisma.clientProfile.create({
        data: {
          userId: kamilla.id,
          trainerId: trainerProfile.id,
          fullName: KAMILLA_NAME,
          email: KAMILLA_EMAIL,
          status: "active",
        },
        select: { id: true },
      });
      console.log("✓ ClientProfile angelegt:", clientProfile.id);
    }

    // ── SCHRITT 3: WorkoutPlan + Day + Exercise + AssignedPlan ─────────────────
    let plan = await prisma.workoutPlan.findFirst({
      where: { trainerId: trainerProfile.id, name: "Kamilla Test Plan" },
      select: { id: true },
    });
    if (plan) {
      console.log("• WorkoutPlan existiert bereits, überspringe:", plan.id);
    } else {
      plan = await prisma.workoutPlan.create({
        data: { trainerId: trainerProfile.id, name: "Kamilla Test Plan", isActive: true },
        select: { id: true },
      });
      console.log("✓ WorkoutPlan angelegt:", plan.id);
    }

    let day = await prisma.workoutDay.findFirst({
      where: { planId: plan.id, name: "Push" },
      select: { id: true },
    });
    if (day) {
      console.log("• WorkoutDay existiert bereits, überspringe:", day.id);
    } else {
      day = await prisma.workoutDay.create({
        data: { planId: plan.id, name: "Push", sortOrder: 0 },
        select: { id: true },
      });
      console.log("✓ WorkoutDay angelegt:", day.id);
    }

    let exercise = await prisma.exercise.findFirst({
      where: { dayId: day.id, name: "Bankdrücken" },
      select: { id: true },
    });
    if (exercise) {
      console.log("• Exercise existiert bereits, überspringe:", exercise.id);
    } else {
      exercise = await prisma.exercise.create({
        data: { dayId: day.id, name: "Bankdrücken", sets: 3, reps: "10" },
        select: { id: true },
      });
      console.log("✓ Exercise angelegt:", exercise.id);
    }

    let assignedPlan = await prisma.assignedPlan.findUnique({
      where: { clientId_planId: { clientId: clientProfile.id, planId: plan.id } },
      select: { id: true },
    });
    if (assignedPlan) {
      console.log("• AssignedPlan existiert bereits, überspringe:", assignedPlan.id);
    } else {
      assignedPlan = await prisma.assignedPlan.create({
        data: { clientId: clientProfile.id, planId: plan.id, active: true },
        select: { id: true },
      });
      console.log("✓ AssignedPlan angelegt:", assignedPlan.id);
    }

    // ── SCHRITT 4: NutritionPlan + Meal + AssignedNutritionPlan ────────────────
    let nutritionPlan = await prisma.nutritionPlan.findFirst({
      where: { trainerId: trainerProfile.id, name: "Kamilla Ernährung" },
      select: { id: true },
    });
    if (nutritionPlan) {
      console.log("• NutritionPlan existiert bereits, überspringe:", nutritionPlan.id);
    } else {
      nutritionPlan = await prisma.nutritionPlan.create({
        data: { trainerId: trainerProfile.id, name: "Kamilla Ernährung" },
        select: { id: true },
      });
      console.log("✓ NutritionPlan angelegt:", nutritionPlan.id);
    }

    let meal = await prisma.nutritionMeal.findFirst({
      where: { planId: nutritionPlan.id, name: "Mahlzeit 1" },
      select: { id: true },
    });
    if (meal) {
      console.log("• NutritionMeal existiert bereits, überspringe:", meal.id);
    } else {
      meal = await prisma.nutritionMeal.create({
        data: { planId: nutritionPlan.id, name: "Mahlzeit 1", sortOrder: 0 },
        select: { id: true },
      });
      console.log("✓ NutritionMeal angelegt:", meal.id);
    }

    let assignedNutritionPlan = await prisma.assignedNutritionPlan.findUnique({
      where: { clientId_planId: { clientId: clientProfile.id, planId: nutritionPlan.id } },
      select: { id: true },
    });
    if (assignedNutritionPlan) {
      console.log("• AssignedNutritionPlan existiert bereits, überspringe:", assignedNutritionPlan.id);
    } else {
      assignedNutritionPlan = await prisma.assignedNutritionPlan.create({
        data: { clientId: clientProfile.id, planId: nutritionPlan.id, active: true },
        select: { id: true },
      });
      console.log("✓ AssignedNutritionPlan angelegt:", assignedNutritionPlan.id);
    }

    // ── SCHRITT 5: Message (Trainer → Kamilla) ────────────────────────────────
    const existingMessage = await prisma.message.findFirst({
      where: { senderId: trainerUser.id, receiverId: kamilla.id },
      select: { id: true },
    });
    if (existingMessage) {
      console.log("• Message existiert bereits, überspringe:", existingMessage.id);
    } else {
      const message = await prisma.message.create({
        data: {
          senderId: trainerUser.id,
          receiverId: kamilla.id,
          content: "Hallo Kamilla, willkommen bei MilaCoach!",
          readAt: null,
        },
        select: { id: true },
      });
      console.log("✓ Message angelegt:", message.id);
    }

    // ── SCHRITT 6: WorkoutLog + ExerciseLog (für Rekorde) ─────────────────────
    const today = new Date().toISOString().split("T")[0];
    let workoutLog = await prisma.workoutLog.findFirst({
      where: { clientId: clientProfile.id, dayId: day.id, date: today },
      select: { id: true },
    });
    if (workoutLog) {
      console.log("• WorkoutLog existiert bereits, überspringe:", workoutLog.id);
    } else {
      workoutLog = await prisma.workoutLog.create({
        data: {
          clientId: clientProfile.id,
          dayId: day.id,
          date: today,
          completedAt: new Date(),
        },
        select: { id: true },
      });
      console.log("✓ WorkoutLog angelegt:", workoutLog.id);
    }

    const existingExerciseLog = await prisma.exerciseLog.findFirst({
      where: { workoutLogId: workoutLog.id, exerciseId: exercise.id, setsDone: 1 },
      select: { id: true },
    });
    if (existingExerciseLog) {
      console.log("• ExerciseLog existiert bereits, überspringe:", existingExerciseLog.id);
    } else {
      const exerciseLog = await prisma.exerciseLog.create({
        data: {
          workoutLogId: workoutLog.id,
          exerciseId: exercise.id,
          actualWeight: 60,
          actualReps: "10",
          setsDone: 1,
          completed: true,
        },
        select: { id: true },
      });
      console.log("✓ ExerciseLog angelegt:", exerciseLog.id);
    }

    // ── SCHRITT 7: ProgressLog (2 Einträge für Gewichtsverlauf) ───────────────
    const progressEntries = [
      { date: "2026-05-20", bodyWeight: 62.5 },
      { date: "2026-05-27", bodyWeight: 61.8 },
    ];
    for (const entry of progressEntries) {
      const existing = await prisma.progressLog.findFirst({
        where: { clientId: clientProfile.id, date: entry.date },
        select: { id: true },
      });
      if (existing) {
        console.log(`• ProgressLog (${entry.date}) existiert bereits, überspringe:`, existing.id);
      } else {
        const created = await prisma.progressLog.create({
          data: {
            clientId: clientProfile.id,
            date: entry.date,
            bodyWeight: entry.bodyWeight,
          },
          select: { id: true },
        });
        console.log(`✓ ProgressLog (${entry.date}) angelegt:`, created.id);
      }
    }

    console.log("\nSeed abgeschlossen.");
    console.log(`Login: ${KAMILLA_EMAIL} / ${KAMILLA_PASSWORD}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Fehler: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
