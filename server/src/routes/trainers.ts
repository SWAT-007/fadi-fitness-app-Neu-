import { Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { unexpectedErrorResponse } from "../utils/errors";

const trainersRouter = Router();

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  normalizeString(value).toLowerCase();

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

// Stats are pulled from the linked TrainerProfile via _count.
const trainerSelect = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  createdAt: true,
  trainerProfile: {
    select: {
      _count: {
        select: { clients: true, workoutPlans: true, nutritionPlans: true },
      },
    },
  },
} as const;

type TrainerRecord = Prisma.UserGetPayload<{ select: typeof trainerSelect }>;

const mapTrainer = (user: TrainerRecord) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  isActive: user.isActive,
  createdAt: user.createdAt,
  stats: {
    clients: user.trainerProfile?._count.clients ?? 0,
    workoutPlans: user.trainerProfile?._count.workoutPlans ?? 0,
    nutritionPlans: user.trainerProfile?._count.nutritionPlans ?? 0,
  },
});

// All routes are ADMIN-only — trainers must not manage themselves/each other.
const requireAdmin = (req: AuthenticatedRequest): boolean => req.user?.role === "admin";

// ── a) GET / — list all trainers (+ stats) ──────────────────────────────────
trainersRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainers = await prisma.user.findMany({
      where: { role: UserRole.TRAINER },
      orderBy: { createdAt: "desc" },
      select: trainerSelect,
    });

    return res.json({ trainers: trainers.map(mapTrainer) });
  } catch (error) {
    return unexpectedErrorResponse(res, "trainers:list", error);
  }
});

// ── b) POST / — create a trainer (User + TrainerProfile, atomic) ─────────────
trainersRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const fullName = normalizeString(req.body?.fullName);

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: "Gueltige E-Mail erforderlich." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Passwort muss mindestens 6 Zeichen haben." });
  }
  if (!fullName) {
    return res.status(400).json({ message: "Name ist erforderlich." });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return res.status(409).json({ message: "Diese E-Mail wird bereits verwendet." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Nested create writes User + TrainerProfile in a single atomic operation
    // (same pattern as auth /register).
    const trainer = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.TRAINER,
        fullName,
        trainerProfile: { create: {} },
      },
      select: { id: true, email: true, fullName: true },
    });

    return res.status(201).json({ ok: true, trainer });
  } catch (error) {
    // Safety net for a race on the unique email between check and insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Diese E-Mail wird bereits verwendet." });
    }
    return unexpectedErrorResponse(res, "trainers:create", error);
  }
});

// ── c) GET /:id — trainer details (+ stats) ─────────────────────────────────
trainersRouter.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const id = getParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainer = await prisma.user.findFirst({
      where: { id, role: UserRole.TRAINER },
      select: trainerSelect,
    });

    if (!trainer) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({ trainer: mapTrainer(trainer) });
  } catch (error) {
    return unexpectedErrorResponse(res, "trainers:detail", error);
  }
});

// ── d) PATCH /:id — edit trainer (fullName / email / isActive) ──────────────
trainersRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const id = getParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const target = await prisma.user.findFirst({
      where: { id, role: UserRole.TRAINER },
      select: { id: true },
    });
    if (!target) {
      return res.status(404).json({ message: "Not found" });
    }

    const data: Prisma.UserUpdateInput = {};

    if (req.body?.fullName !== undefined) {
      const fullName = normalizeString(req.body.fullName);
      if (!fullName) {
        return res.status(400).json({ message: "Name ist erforderlich." });
      }
      data.fullName = fullName;
    }

    if (req.body?.email !== undefined) {
      const email = normalizeEmail(req.body.email);
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ message: "Gueltige E-Mail erforderlich." });
      }
      const duplicate = await prisma.user.findFirst({
        where: { email, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(409).json({ message: "Diese E-Mail wird bereits verwendet." });
      }
      data.email = email;
    }

    if (typeof req.body?.isActive === "boolean") {
      data.isActive = req.body.isActive;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, fullName: true, isActive: true },
    });

    return res.json({ ok: true, trainer: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Diese E-Mail wird bereits verwendet." });
    }
    return unexpectedErrorResponse(res, "trainers:update", error);
  }
});

// ── e) DELETE /:id — deactivate (soft, no hard delete) ──────────────────────
trainersRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const id = getParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const target = await prisma.user.findFirst({
      where: { id, role: UserRole.TRAINER },
      select: { id: true },
    });
    if (!target) {
      return res.status(404).json({ message: "Not found" });
    }

    // Soft deactivate — keep User + TrainerProfile so client data stays intact.
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true },
    });

    return res.json({ ok: true });
  } catch (error) {
    return unexpectedErrorResponse(res, "trainers:deactivate", error);
  }
});

// ── f) POST /:id/reset-password — set a new password (admin) ─────────────────
trainersRouter.post("/:id/reset-password", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const id = getParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 6) {
    return res.status(400).json({ message: "Passwort muss mindestens 6 Zeichen haben." });
  }

  try {
    const target = await prisma.user.findFirst({
      where: { id, role: UserRole.TRAINER },
      select: { id: true },
    });
    if (!target) {
      return res.status(404).json({ message: "Not found" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: { id: true },
    });

    return res.json({ ok: true });
  } catch (error) {
    return unexpectedErrorResponse(res, "trainers:reset-password", error);
  }
});

// ── g) DELETE /:id/permanent — hard delete (admin, only if no clients) ───────
// Separate from the soft DELETE /:id (deactivate) used by the list page.
trainersRouter.delete("/:id/permanent", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const id = getParam(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const target = await prisma.user.findFirst({
      where: { id, role: UserRole.TRAINER },
      select: { id: true, trainerProfile: { select: { id: true } } },
    });
    if (!target) {
      return res.status(404).json({ message: "Not found" });
    }

    const trainerProfileId = target.trainerProfile?.id;

    // Safety check: refuse if the trainer still has clients.
    if (trainerProfileId) {
      const clientCount = await prisma.clientProfile.count({
        where: { trainerId: trainerProfileId },
      });
      if (clientCount > 0) {
        return res.status(409).json({
          error: `Trainer hat noch ${clientCount} Kunden. Bitte erst Kunden loeschen oder einem anderen Trainer zuweisen.`,
        });
      }
    }

    try {
      // Hard delete: TrainerProfile + User in one transaction.
      await prisma.$transaction(async (tx) => {
        if (trainerProfileId) {
          await tx.trainerProfile.delete({ where: { id: trainerProfileId } });
        }
        await tx.user.delete({ where: { id } });
      });
    } catch (txError) {
      // Other Restrict relations (e.g. workout/nutrition plans) block deletion.
      if (txError instanceof Prisma.PrismaClientKnownRequestError && txError.code === "P2003") {
        return res.status(409).json({
          error: "Trainer hat noch zugeordnete Daten (z.B. Trainings- oder Ernaehrungsplaene). Bitte diese zuerst entfernen.",
        });
      }
      throw txError;
    }

    return res.json({ ok: true, deleted: true });
  } catch (error) {
    return unexpectedErrorResponse(res, "trainers:delete-permanent", error);
  }
});

export { trainersRouter };
