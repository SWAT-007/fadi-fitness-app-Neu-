import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../db";
import { resolveScope } from "../lib/scope";
import { isTrainerOrAdmin, requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { buildExerciseChangeLink, createRequestAcceptedNotification } from "./notificationHelpers";

const plansRouter = Router();
const workoutDaysRouter = Router();
const exercisesRouter = Router();

const mapPlan = (plan: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    days: number;
    assignedPlans: number;
  };
}) => ({
  id: plan.id,
  name: plan.name,
  title: plan.name,
  description: plan.description,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
  dayCount: plan._count.days,
  assignmentCount: plan._count.assignedPlans,
});

plansRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const planDescription =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;
  const daysInput = Array.isArray(req.body?.days) ? req.body.days : [];

  if (!planName) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const normalizedDays: Array<{
    name: string;
    description: string | null;
    exercises: Array<{
      name: string;
      description: string | null;
      sets: number;
      reps: string;
      targetWeightKg: number | null;
      restSeconds: number | null;
      note: string | null;
      imageUrl: string | null;
    }>;
  }> = [];

  for (const dayItem of daysInput) {
    const dayName = typeof dayItem?.name === "string" ? dayItem.name.trim() : "";
    if (!dayName) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const dayDescriptionInput = dayItem?.description;
    const dayDescription =
      dayDescriptionInput === null
        ? null
        : typeof dayDescriptionInput === "string"
          ? dayDescriptionInput
          : null;
    const exercisesInput = Array.isArray(dayItem?.exercises) ? dayItem.exercises : [];
    const normalizedExercises: Array<{
      name: string;
      description: string | null;
      sets: number;
      reps: string;
      targetWeightKg: number | null;
      restSeconds: number | null;
      note: string | null;
      imageUrl: string | null;
    }> = [];

    for (const exerciseItem of exercisesInput) {
      const exerciseName = typeof exerciseItem?.name === "string" ? exerciseItem.name.trim() : "";
      if (!exerciseName) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const exerciseDescriptionInput = exerciseItem?.description;
      const exerciseDescription =
        exerciseDescriptionInput === null
          ? null
          : typeof exerciseDescriptionInput === "string"
            ? exerciseDescriptionInput
            : null;
      const setsInput = exerciseItem?.sets;
      const sets =
        typeof setsInput === "number" && Number.isInteger(setsInput) && setsInput > 0
          ? setsInput
          : 3;
      const repsInput = exerciseItem?.reps;
      const reps = typeof repsInput === "string" && repsInput.trim() ? repsInput.trim() : "10";
      const targetWeightKgInput = exerciseItem?.targetWeightKg;
      const targetWeightKg =
        targetWeightKgInput === null
          ? null
          : typeof targetWeightKgInput === "number" && Number.isFinite(targetWeightKgInput)
            ? targetWeightKgInput
            : null;
      const restSecondsInput = exerciseItem?.restSeconds;
      const restSeconds =
        restSecondsInput === null
          ? null
          : typeof restSecondsInput === "number" && Number.isFinite(restSecondsInput)
            ? restSecondsInput
            : null;
      const noteInput = exerciseItem?.note;
      const note = noteInput === null ? null : typeof noteInput === "string" ? noteInput : null;
      const imageUrlInput = exerciseItem?.imageUrl;
      const imageUrl = imageUrlInput === null ? null : typeof imageUrlInput === "string" ? imageUrlInput : null;

      normalizedExercises.push({
        name: exerciseName,
        description: exerciseDescription,
        sets,
        reps,
        targetWeightKg,
        restSeconds,
        note,
        imageUrl,
      });
    }

    normalizedDays.push({
      name: dayName,
      description: dayDescription,
      exercises: normalizedExercises,
    });
  }

  try {
    const scope = await resolveScope(req.user);
    const ownedTrainerId = scope.trainerProfileId;
    if (!ownedTrainerId) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const createdPlan = await tx.workoutPlan.create({
        data: {
          trainerId: ownedTrainerId,
          name: planName,
          description: planDescription,
        },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      let exerciseCount = 0;

      for (let dayIndex = 0; dayIndex < normalizedDays.length; dayIndex += 1) {
        const day = normalizedDays[dayIndex];
        const createdDay = await tx.workoutDay.create({
          data: {
            planId: createdPlan.id,
            name: day.name,
            description: day.description,
            sortOrder: dayIndex,
          },
          select: { id: true },
        });

        for (let exerciseIndex = 0; exerciseIndex < day.exercises.length; exerciseIndex += 1) {
          const exercise = day.exercises[exerciseIndex];
          await tx.exercise.create({
            data: {
              dayId: createdDay.id,
              name: exercise.name,
              description: exercise.description,
              sets: exercise.sets,
              reps: exercise.reps,
              targetWeightKg: exercise.targetWeightKg,
              restSeconds: exercise.restSeconds,
              note: exercise.note,
              sortOrder: exerciseIndex,
              imageUrl: exercise.imageUrl,
            },
          });
          exerciseCount += 1;
        }
      }

      return {
        plan: createdPlan,
        dayCount: normalizedDays.length,
        exerciseCount,
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error("[plans:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const scope = await resolveScope(req.user);

    const plans = await prisma.workoutPlan.findMany({
      where: {
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            days: true,
            assignedPlans: true,
          },
        },
      },
    });

    return res.json({ plans: plans.map(mapPlan) });
  } catch (error) {
    console.error("[plans:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      include: {
        days: {
          orderBy: { sortOrder: "asc" },
          include: {
            exercises: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    if (!plan) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
      days: plan.days.map((day: (typeof plan.days)[number]) => ({
        id: day.id,
        planId: day.planId,
        name: day.name,
        description: day.description,
        sortOrder: day.sortOrder,
        exercises: day.exercises.map((exercise: (typeof day.exercises)[number]) => ({
          id: exercise.id,
          dayId: exercise.dayId,
          name: exercise.name,
          description: exercise.description,
          sets: exercise.sets,
          reps: exercise.reps,
          targetWeightKg: exercise.targetWeightKg,
          restSeconds: exercise.restSeconds,
          note: exercise.note,
          sortOrder: exercise.sortOrder,
          imageUrl: exercise.imageUrl,
          libraryId: null,
        })),
      })),
    });
  } catch (error) {
    console.error("[plans:detail] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.patch("/:id/days/reorder", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const dayIdsInput = req.body?.dayIds;
  if (
    !Array.isArray(dayIdsInput) ||
    dayIdsInput.length === 0 ||
    !dayIdsInput.every((value) => typeof value === "string" && value.length > 0)
  ) {
    return res.status(400).json({ message: "dayIds must be a non-empty string array" });
  }
  const dayIds = dayIdsInput as string[];

  if (new Set(dayIds).size !== dayIds.length) {
    return res.status(400).json({ message: "dayIds must be unique" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: { id: true },
    });
    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    const planDays = await prisma.workoutDay.findMany({
      where: { planId: existingPlan.id },
      select: { id: true },
    });
    const planDayIds = new Set(planDays.map((day) => day.id));
    if (dayIds.length !== planDayIds.size || !dayIds.every((dayId) => planDayIds.has(dayId))) {
      return res.status(400).json({ message: "dayIds must match exactly the days of this plan" });
    }

    await prisma.$transaction(
      dayIds.map((dayId, index) =>
        prisma.workoutDay.update({
          where: { id: dayId },
          data: { sortOrder: index },
        }),
      ),
    );

    const reorderedDays = await prisma.workoutDay.findMany({
      where: { planId: existingPlan.id },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        planId: true,
        name: true,
        description: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return res.json({
      ok: true,
      days: reorderedDays.map((day) => ({
        id: day.id,
        planId: day.planId,
        name: day.name,
        description: day.description,
        sortOrder: day.sortOrder,
        createdAt: day.createdAt,
      })),
    });
  } catch (error) {
    console.error("[plans:reorder-days] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Save the WHOLE edited plan in one transaction (draft-mode commit).
// Diff/upsert: existing ids are updated, missing ids deleted, null/tmp ids created.
// Exercises are upserted (NOT delete+recreate) so kept exercises retain their
// WorkoutLogs/ExerciseLogs. Optionally resolves a linked change-request in the
// same transaction. Existing single-item endpoints stay untouched.
plansRouter.put("/:id/full", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  // ── Input normalization helpers ───────────────────────────────────────────
  const httpError = (status: number, message: string) =>
    Object.assign(new Error(message), { httpStatus: status });
  const isNewId = (id: unknown) =>
    id === null || id === undefined || (typeof id === "string" && id.startsWith("tmp"));
  const asStr = (v: unknown) => (typeof v === "string" ? v : "");
  const asNullableStr = (v: unknown) => (v === null ? null : typeof v === "string" ? v : null);
  const asInt = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback;
  const asReps = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "10");
  const asNullableNum = (v: unknown) =>
    v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : null;

  const planName = asStr(req.body?.name).trim();
  if (!planName) {
    return res.status(400).json({ message: "Invalid request: plan name required" });
  }
  const daysInput = Array.isArray(req.body?.days) ? (req.body.days as unknown[]) : [];
  const requestIdInput = req.body?.requestId;
  const requestId =
    typeof requestIdInput === "string" && requestIdInput.length > 0 ? requestIdInput : null;

  try {
    const scope = await resolveScope(req.user);

    await prisma.$transaction(async (tx) => {
      // Plan must belong to this trainer
      const existingPlan = await tx.workoutPlan.findFirst({
        where: {
          id: planId,
          ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
        },
        select: { id: true },
      });
      if (!existingPlan) {
        throw httpError(404, "Not found");
      }

      // Current DB structure (for diff + ownership validation)
      const dbDays = await tx.workoutDay.findMany({
        where: { planId },
        select: { id: true, exercises: { select: { id: true } } },
      });
      const dbDayIds = new Set(dbDays.map((d) => d.id));
      const dbExByDay = new Map<string, Set<string>>(
        dbDays.map((d) => [d.id, new Set(d.exercises.map((e) => e.id))]),
      );

      // Update plan name
      await tx.workoutPlan.update({ where: { id: planId }, data: { name: planName } });

      // Validate provided day ids + compute which existing days to keep
      const keepDayIds: string[] = [];
      for (const rawDay of daysInput) {
        const dayObj = (rawDay ?? {}) as { id?: unknown };
        if (!isNewId(dayObj.id)) {
          const dayId = asStr(dayObj.id);
          if (!dbDayIds.has(dayId)) {
            throw httpError(400, `Unknown dayId: ${dayId}`);
          }
          keepDayIds.push(dayId);
        }
      }

      // Delete removed days (cascades their exercises + logs — intended when a day is removed)
      await tx.workoutDay.deleteMany({
        where: { planId, id: { notIn: keepDayIds } },
      });

      // Upsert days + their exercises, sortOrder = array index
      for (let dayIndex = 0; dayIndex < daysInput.length; dayIndex += 1) {
        const rawDay = (daysInput[dayIndex] ?? {}) as {
          id?: unknown;
          name?: unknown;
          description?: unknown;
          exercises?: unknown;
        };
        const dayName = asStr(rawDay.name).trim();
        if (!dayName) {
          throw httpError(400, "Invalid request: day name required");
        }
        const dayDescription = asNullableStr(rawDay.description);
        const exercisesInput = Array.isArray(rawDay.exercises) ? (rawDay.exercises as unknown[]) : [];

        let dayId: string;
        if (isNewId(rawDay.id)) {
          const createdDay = await tx.workoutDay.create({
            data: { planId, name: dayName, description: dayDescription, sortOrder: dayIndex },
            select: { id: true },
          });
          dayId = createdDay.id;
        } else {
          dayId = asStr(rawDay.id);
          await tx.workoutDay.update({
            where: { id: dayId },
            data: { name: dayName, description: dayDescription, sortOrder: dayIndex },
          });
        }

        const existingExIds = dbExByDay.get(dayId) ?? new Set<string>();

        // Validate provided exercise ids + compute which to keep (update)
        const keepExIds: string[] = [];
        for (const rawEx of exercisesInput) {
          const exObj = (rawEx ?? {}) as { id?: unknown };
          if (!isNewId(exObj.id)) {
            const exId = asStr(exObj.id);
            if (!existingExIds.has(exId)) {
              throw httpError(400, `Unknown exerciseId for day ${dayId}: ${exId}`);
            }
            keepExIds.push(exId);
          }
        }

        // Delete only the exercises actually removed (kept ones retain their logs)
        await tx.exercise.deleteMany({
          where: { dayId, id: { notIn: keepExIds } },
        });

        // Upsert exercises, sortOrder = array index
        for (let exIndex = 0; exIndex < exercisesInput.length; exIndex += 1) {
          const rawEx = (exercisesInput[exIndex] ?? {}) as Record<string, unknown>;
          const exName = asStr(rawEx.name).trim();
          if (!exName) {
            throw httpError(400, "Invalid request: exercise name required");
          }
          const exData = {
            name: exName,
            description: asNullableStr(rawEx.description),
            sets: asInt(rawEx.sets, 3),
            reps: asReps(rawEx.reps),
            targetWeightKg: asNullableNum(rawEx.targetWeightKg),
            restSeconds: asNullableNum(rawEx.restSeconds),
            note: asNullableStr(rawEx.note),
            imageUrl: asNullableStr(rawEx.imageUrl),
            sortOrder: exIndex,
          };
          if (isNewId(rawEx.id)) {
            await tx.exercise.create({ data: { dayId, ...exData } });
          } else {
            await tx.exercise.update({ where: { id: asStr(rawEx.id) }, data: exData });
          }
        }
      }

      // Optionally resolve a linked change-request — only if it belongs to this plan + trainer
      if (requestId) {
        const request = await tx.exerciseChangeRequest.findFirst({
          where: {
            id: requestId,
            day: { planId },
            ...(scope.filterTrainerId && {
              client: { trainerId: scope.filterTrainerId },
            }),
          },
          select: {
            id: true,
            status: true,
            dayId: true,
            exerciseId: true,
            exercise: { select: { id: true, name: true } },
            client: { select: { userId: true } },
          },
        });
        if (!request) {
          throw httpError(400, "requestId does not belong to this plan");
        }
        const alreadyResolved = request.status === "resolved";
        await tx.exerciseChangeRequest.update({
          where: { id: requestId },
          data: { status: "resolved" },
        });
        // Notify the client once (idempotent) with a deep link to the exercise.
        if (!alreadyResolved && request.client.userId) {
          await createRequestAcceptedNotification(tx, {
            userId: request.client.userId,
            exerciseName: request.exercise?.name ?? null,
            link: buildExerciseChangeLink(request.dayId, request.exercise ? request.exerciseId : null),
          });
        }
      }
    });

    // Return the freshly saved plan tree (with REAL ids) — same shape as GET /:id
    const saved = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      include: {
        days: {
          orderBy: { sortOrder: "asc" },
          include: { exercises: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!saved) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({
      plan: {
        id: saved.id,
        name: saved.name,
        description: saved.description,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
      days: saved.days.map((day: (typeof saved.days)[number]) => ({
        id: day.id,
        planId: day.planId,
        name: day.name,
        description: day.description,
        sortOrder: day.sortOrder,
        exercises: day.exercises.map((exercise: (typeof day.exercises)[number]) => ({
          id: exercise.id,
          dayId: exercise.dayId,
          name: exercise.name,
          description: exercise.description,
          sets: exercise.sets,
          reps: exercise.reps,
          targetWeightKg: exercise.targetWeightKg,
          restSeconds: exercise.restSeconds,
          note: exercise.note,
          sortOrder: exercise.sortOrder,
          imageUrl: exercise.imageUrl,
          libraryId: null,
        })),
      })),
    });
  } catch (error) {
    const httpStatus =
      error && typeof error === "object" && "httpStatus" in error
        ? (error as { httpStatus: number }).httpStatus
        : 500;
    if (httpStatus !== 500) {
      return res.status(httpStatus).json({ message: (error as Error).message });
    }
    console.error("[plans:save-full] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name =
    typeof req.body?.name === "string"
      ? req.body.name.trim()
      : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: { id: true },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    const updatedPlan = await prisma.workoutPlan.update({
      where: { id: existingPlan.id },
      data: {
        name,
        description,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      plan: {
        id: updatedPlan.id,
        name: updatedPlan.name,
        description: updatedPlan.description,
        createdAt: updatedPlan.createdAt,
        updatedAt: updatedPlan.updatedAt,
      },
    });
  } catch (error) {
    console.error("[plans:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: { id: true },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.workoutPlan.delete({
      where: { id: existingPlan.id },
    });

    return res.json({
      deleted: true,
      planId: existingPlan.id,
    });
  } catch (error) {
    console.error("[plans:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.post("/:id/days", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!existingPlan) {
      return res.status(404).json({ message: "Not found" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lastDay = await tx.workoutDay.findFirst({
        where: { planId: existingPlan.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      const sortOrder = lastDay ? lastDay.sortOrder + 1 : 0;

      const day = await tx.workoutDay.create({
        data: {
          planId: existingPlan.id,
          name,
          description,
          sortOrder,
        },
        select: {
          id: true,
          planId: true,
          name: true,
          description: true,
          sortOrder: true,
          createdAt: true,
        },
      });

      const assignedPlans = await tx.assignedPlan.findMany({
        where: {
          planId: existingPlan.id,
          active: true,
        },
        select: {
          client: {
            select: {
              userId: true,
            },
          },
        },
      });

      const recipientUserIds = Array.from(
        new Set(
          assignedPlans
            .map((item) => item.client.userId)
            .filter((userId): userId is string => Boolean(userId)),
        ),
      );

      let notificationCount = 0;
      if (recipientUserIds.length > 0) {
        const created = await tx.notification.createMany({
          data: recipientUserIds.map((userId) => ({
            userId,
            type: "WORKOUT",
            title: "Neues Workout hinzugefügt",
            body: `${existingPlan.name}: ${day.name}`,
          })),
        });
        notificationCount = created.count;
      }

      return { day, notificationCount };
    });

    return res.status(201).json({
      day: {
        id: result.day.id,
        planId: result.day.planId,
        name: result.day.name,
        description: result.day.description,
        sortOrder: result.day.sortOrder,
        createdAt: result.day.createdAt,
      },
      notificationCount: result.notificationCount,
    });
  } catch (error) {
    console.error("[plans:create-day] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

plansRouter.post("/:id/assignments", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const planIdParam = req.params.id;
  const planId = Array.isArray(planIdParam) ? planIdParam[0] : planIdParam;
  if (!planId) {
    return res.status(404).json({ message: "Not found" });
  }

  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        id: planId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!plan) {
      return res.status(404).json({ message: "Not found" });
    }

    const client = await prisma.clientProfile.findFirst({
      where: {
        id: clientId,
        ...(scope.filterTrainerId && { trainerId: scope.filterTrainerId }),
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Not found" });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.assignedPlan.updateMany({
        where: {
          clientId: client.id,
          active: true,
        },
        data: {
          active: false,
        },
      });

      const existing = await tx.assignedPlan.findUnique({
        where: {
          clientId_planId: {
            clientId: client.id,
            planId: plan.id,
          },
        },
        select: {
          id: true,
        },
      });

      const assignment = existing
        ? await tx.assignedPlan.update({
            where: { id: existing.id },
            data: {
              active: true,
              assignedAt: now,
            },
            select: {
              id: true,
              clientId: true,
              planId: true,
              active: true,
              assignedAt: true,
            },
          })
        : await tx.assignedPlan.create({
            data: {
              clientId: client.id,
              planId: plan.id,
              active: true,
              assignedAt: now,
            },
            select: {
              id: true,
              clientId: true,
              planId: true,
              active: true,
              assignedAt: true,
            },
          });

      let notificationCreated = false;
      if (client.userId) {
        await tx.notification.create({
          data: {
            userId: client.userId,
            type: "WORKOUT_PLAN",
            title: "Neuer Trainingsplan zugewiesen",
            body: plan.name,
          },
        });
        notificationCreated = true;
      }

      return { assignment, notificationCreated };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("[plans:assign] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

workoutDaysRouter.patch("/:dayId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        ...(scope.filterTrainerId && {
          plan: {
            trainerId: scope.filterTrainerId,
          },
        }),
      },
      select: {
        id: true,
      },
    });

    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    const updatedDay = await prisma.workoutDay.update({
      where: { id: existingDay.id },
      data: {
        name,
        description,
      },
      select: {
        id: true,
        planId: true,
        name: true,
        description: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return res.json({
      day: {
        id: updatedDay.id,
        planId: updatedDay.planId,
        name: updatedDay.name,
        description: updatedDay.description,
        sortOrder: updatedDay.sortOrder,
        createdAt: updatedDay.createdAt,
      },
    });
  } catch (error) {
    console.error("[plans:update-day] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

workoutDaysRouter.delete("/:dayId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        ...(scope.filterTrainerId && {
          plan: {
            trainerId: scope.filterTrainerId,
          },
        }),
      },
      select: { id: true },
    });

    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.workoutDay.delete({
      where: { id: existingDay.id },
    });

    return res.json({
      deleted: true,
      dayId: existingDay.id,
    });
  } catch (error) {
    console.error("[plans:delete-day] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

workoutDaysRouter.post("/:dayId/exercises", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;
  const setsInput = req.body?.sets;
  const sets =
    typeof setsInput === "number" && Number.isInteger(setsInput) && setsInput > 0
      ? setsInput
      : 3;
  const repsInput = req.body?.reps;
  const reps = typeof repsInput === "string" && repsInput.trim() ? repsInput.trim() : "10";
  const targetWeightKgInput = req.body?.targetWeightKg;
  const targetWeightKg =
    targetWeightKgInput === null
      ? null
      : typeof targetWeightKgInput === "number" && Number.isFinite(targetWeightKgInput)
        ? targetWeightKgInput
        : null;
  const restSecondsInput = req.body?.restSeconds;
  const restSeconds =
    restSecondsInput === null
      ? null
      : typeof restSecondsInput === "number" && Number.isFinite(restSecondsInput)
        ? restSecondsInput
        : null;
  const noteInput = req.body?.note;
  const note = noteInput === null ? null : typeof noteInput === "string" ? noteInput : null;
  const imageUrlInput = req.body?.imageUrl;
  const clientImageUrl = imageUrlInput === null ? null : typeof imageUrlInput === "string" ? imageUrlInput : null;
  const libraryItemIdInput = req.body?.libraryItemId;
  const libraryItemId = typeof libraryItemIdInput === "string" && libraryItemIdInput ? libraryItemIdInput : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);

    // Prefer DB-trusted imageUrl from ExerciseLibrary over client-sent value
    let imageUrl = clientImageUrl;
    if (libraryItemId) {
      const libraryItem = await prisma.exerciseLibrary.findUnique({
        where: { id: libraryItemId },
        select: { imageUrl: true },
      });
      if (libraryItem) {
        imageUrl = libraryItem.imageUrl ?? null;
      }
    }

    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        ...(scope.filterTrainerId && {
          plan: {
            trainerId: scope.filterTrainerId,
          },
        }),
      },
      select: { id: true },
    });

    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    const lastExercise = await prisma.exercise.findFirst({
      where: { dayId: existingDay.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const sortOrder = lastExercise ? lastExercise.sortOrder + 1 : 0;

    const createdExercise = await prisma.exercise.create({
      data: {
        dayId: existingDay.id,
        name,
        description,
        sets,
        reps,
        targetWeightKg,
        restSeconds,
        note,
        sortOrder,
        imageUrl,
      },
      select: {
        id: true,
        dayId: true,
        name: true,
        description: true,
        sets: true,
        reps: true,
        targetWeightKg: true,
        restSeconds: true,
        note: true,
        sortOrder: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      exercise: {
        ...createdExercise,
        libraryId: null,
      },
    });
  } catch (error) {
    console.error("[plans:create-exercise] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Reorder exercises within a day: persist a new order by rewriting sortOrder 0..n
// in a single transaction. All exerciseIds must belong to this day.
workoutDaysRouter.patch("/:dayId/exercises/reorder", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const dayIdParam = req.params.dayId;
  const dayId = Array.isArray(dayIdParam) ? dayIdParam[0] : dayIdParam;
  if (!dayId) {
    return res.status(404).json({ message: "Not found" });
  }

  const exerciseIdsInput = req.body?.exerciseIds;
  if (
    !Array.isArray(exerciseIdsInput) ||
    exerciseIdsInput.length === 0 ||
    !exerciseIdsInput.every((value) => typeof value === "string" && value.length > 0)
  ) {
    return res.status(400).json({ message: "exerciseIds must be a non-empty string array" });
  }
  const exerciseIds = exerciseIdsInput as string[];

  // Reject duplicates
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    return res.status(400).json({ message: "exerciseIds must be unique" });
  }

  try {
    const scope = await resolveScope(req.user);

    // Day must belong to this trainer
    const existingDay = await prisma.workoutDay.findFirst({
      where: {
        id: dayId,
        ...(scope.filterTrainerId && {
          plan: { trainerId: scope.filterTrainerId },
        }),
      },
      select: { id: true },
    });
    if (!existingDay) {
      return res.status(404).json({ message: "Not found" });
    }

    // All exercises of this day (must exactly match the provided id set)
    const dayExercises = await prisma.exercise.findMany({
      where: { dayId: existingDay.id },
      select: { id: true },
    });
    const dayExerciseIds = new Set(dayExercises.map((e) => e.id));
    if (
      exerciseIds.length !== dayExerciseIds.size ||
      !exerciseIds.every((id) => dayExerciseIds.has(id))
    ) {
      return res.status(400).json({ message: "exerciseIds must match exactly the exercises of this day" });
    }

    await prisma.$transaction(
      exerciseIds.map((exerciseId, index) =>
        prisma.exercise.update({
          where: { id: exerciseId },
          data: { sortOrder: index },
        }),
      ),
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error("[plans:reorder-exercises] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.get("/library", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const searchInput = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const muscleGroupInput =
    typeof req.query.muscleGroup === "string" ? req.query.muscleGroup.trim() : "";
  const limitInput = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
  const limit = Number.isFinite(limitInput) && limitInput > 0 ? Math.min(limitInput, 1000) : 500;

  const where: {
    name?: { contains: string; mode: "insensitive" };
    muscleGroup?: string;
  } = {};

  if (searchInput) {
    where.name = {
      contains: searchInput,
      mode: "insensitive",
    };
  }

  if (muscleGroupInput) {
    where.muscleGroup = muscleGroupInput;
  }

  try {
    const exercises = await prisma.exerciseLibrary.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ exercises });
  } catch (error) {
    console.error("[exercises:library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.post("/library", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const muscleGroupInput = req.body?.muscleGroup;
  const equipmentInput = req.body?.equipment;
  const imageUrlInput = req.body?.imageUrl;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  if (
    !(muscleGroupInput === null || muscleGroupInput === undefined || typeof muscleGroupInput === "string") ||
    !(equipmentInput === null || equipmentInput === undefined || typeof equipmentInput === "string") ||
    !(imageUrlInput === null || imageUrlInput === undefined || typeof imageUrlInput === "string")
  ) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const created = await prisma.exerciseLibrary.create({
      data: {
        name,
        muscleGroup: typeof muscleGroupInput === "string" ? muscleGroupInput.trim() || null : null,
        equipment: typeof equipmentInput === "string" ? equipmentInput.trim() || null : null,
        imageUrl: typeof imageUrlInput === "string" ? imageUrlInput.trim() || null : null,
      },
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ exercise: created });
  } catch (error) {
    console.error("[exercises:create-library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Exercise library image upload ───────────────────────────────────────────

const EXERCISE_UPLOADS_DIR = path.join(process.cwd(), "uploads", "exercises");
const ALLOWED_EXERCISE_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const exerciseImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(EXERCISE_UPLOADS_DIR, { recursive: true });
    cb(null, EXERCISE_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const id = (req as unknown as { params: Record<string, string> }).params?.id ?? "unknown";
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${id}-${Date.now()}${ext}`);
  },
});

const exerciseImageUpload = multer({
  storage: exerciseImageStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_EXERCISE_IMAGE_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Ungültiger Dateityp"));
  },
});

const exerciseImageUploadMiddleware = (req: Request, res: Response, next: NextFunction) => {
  exerciseImageUpload.single("image")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload-Fehler: ${err.message}` });
    }
    if (err instanceof Error) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

exercisesRouter.post(
  "/library/:id/image",
  requireAuth,
  exerciseImageUploadMiddleware,
  async (req: AuthenticatedRequest, res) => {
    if (!req.user || !isTrainerOrAdmin(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) return res.status(404).json({ message: "Not found" });

    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ message: "Keine Datei hochgeladen" });

    const cleanup = () => { try { fs.unlinkSync(file.path); } catch { /* ignore */ } };

    try {
      const existing = await prisma.exerciseLibrary.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        cleanup();
        return res.status(404).json({ message: "Not found" });
      }

      const imageUrl = `/uploads/exercises/${file.filename}`;
      const updated = await prisma.exerciseLibrary.update({
        where: { id },
        data: { imageUrl },
        select: {
          id: true,
          name: true,
          muscleGroup: true,
          equipment: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({ exercise: updated });
    } catch (error) {
      cleanup();
      console.error("[exercises:library:image:upload] error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

exercisesRouter.patch("/library/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    return res.status(404).json({ message: "Not found" });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "name");
  const hasMuscleGroup = Object.prototype.hasOwnProperty.call(req.body ?? {}, "muscleGroup");
  const hasEquipment = Object.prototype.hasOwnProperty.call(req.body ?? {}, "equipment");
  const hasImageUrl = Object.prototype.hasOwnProperty.call(req.body ?? {}, "imageUrl");

  const data: {
    name?: string;
    muscleGroup?: string | null;
    equipment?: string | null;
    imageUrl?: string | null;
  } = {};

  if (hasName) {
    if (typeof req.body?.name !== "string" || !req.body.name.trim()) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.name = req.body.name.trim();
  }

  if (hasMuscleGroup) {
    if (!(req.body?.muscleGroup === null || typeof req.body?.muscleGroup === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.muscleGroup =
      typeof req.body?.muscleGroup === "string" ? req.body.muscleGroup.trim() || null : null;
  }

  if (hasEquipment) {
    if (!(req.body?.equipment === null || typeof req.body?.equipment === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.equipment = typeof req.body?.equipment === "string" ? req.body.equipment.trim() || null : null;
  }

  if (hasImageUrl) {
    if (!(req.body?.imageUrl === null || typeof req.body?.imageUrl === "string")) {
      return res.status(400).json({ message: "Invalid request" });
    }
    data.imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() || null : null;
  }

  try {
    const existing = await prisma.exerciseLibrary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const updated = await prisma.exerciseLibrary.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        muscleGroup: true,
        equipment: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ exercise: updated });
  } catch (error) {
    console.error("[exercises:update-library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.delete("/library/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const existing = await prisma.exerciseLibrary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.exerciseLibrary.delete({ where: { id } });
    return res.json({ deleted: true, id });
  } catch (error) {
    console.error("[exercises:delete-library] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.patch("/:exerciseId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const exerciseIdParam = req.params.exerciseId;
  const exerciseId = Array.isArray(exerciseIdParam) ? exerciseIdParam[0] : exerciseIdParam;
  if (!exerciseId) {
    return res.status(404).json({ message: "Not found" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const descriptionInput = req.body?.description;
  const description =
    descriptionInput === null
      ? null
      : typeof descriptionInput === "string"
        ? descriptionInput
        : null;
  const setsInput = req.body?.sets;
  const sets =
    typeof setsInput === "number" && Number.isInteger(setsInput) && setsInput > 0
      ? setsInput
      : 3;
  const repsInput = req.body?.reps;
  const reps = typeof repsInput === "string" && repsInput.trim() ? repsInput.trim() : "10";
  const targetWeightKgInput = req.body?.targetWeightKg;
  const targetWeightKg =
    targetWeightKgInput === null
      ? null
      : typeof targetWeightKgInput === "number" && Number.isFinite(targetWeightKgInput)
        ? targetWeightKgInput
        : null;
  const restSecondsInput = req.body?.restSeconds;
  const restSeconds =
    restSecondsInput === null
      ? null
      : typeof restSecondsInput === "number" && Number.isFinite(restSecondsInput)
        ? restSecondsInput
        : null;
  const noteInput = req.body?.note;
  const note = noteInput === null ? null : typeof noteInput === "string" ? noteInput : null;
  const imageUrlInput = req.body?.imageUrl;
  const imageUrl = imageUrlInput === null ? null : typeof imageUrlInput === "string" ? imageUrlInput : null;

  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingExercise = await prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        ...(scope.filterTrainerId && {
          day: {
            plan: {
              trainerId: scope.filterTrainerId,
            },
          },
        }),
      },
      select: { id: true },
    });

    if (!existingExercise) {
      return res.status(404).json({ message: "Not found" });
    }

    const updatedExercise = await prisma.exercise.update({
      where: { id: existingExercise.id },
      data: {
        name,
        description,
        sets,
        reps,
        targetWeightKg,
        restSeconds,
        note,
        imageUrl,
      },
      select: {
        id: true,
        dayId: true,
        name: true,
        description: true,
        sets: true,
        reps: true,
        targetWeightKg: true,
        restSeconds: true,
        note: true,
        sortOrder: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({
      exercise: {
        ...updatedExercise,
        libraryId: null,
      },
    });
  } catch (error) {
    console.error("[plans:update-exercise] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

exercisesRouter.delete("/:exerciseId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.user || !isTrainerOrAdmin(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const exerciseIdParam = req.params.exerciseId;
  const exerciseId = Array.isArray(exerciseIdParam) ? exerciseIdParam[0] : exerciseIdParam;
  if (!exerciseId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const scope = await resolveScope(req.user);

    const existingExercise = await prisma.exercise.findFirst({
      where: {
        id: exerciseId,
        ...(scope.filterTrainerId && {
          day: {
            plan: {
              trainerId: scope.filterTrainerId,
            },
          },
        }),
      },
      select: { id: true },
    });

    if (!existingExercise) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.exercise.delete({
      where: { id: existingExercise.id },
    });

    return res.json({
      deleted: true,
      exerciseId: existingExercise.id,
    });
  } catch (error) {
    console.error("[plans:delete-exercise] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { plansRouter, workoutDaysRouter, exercisesRouter };

