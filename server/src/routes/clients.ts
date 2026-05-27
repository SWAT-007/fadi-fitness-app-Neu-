import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";

const clientsRouter = Router();

const normalizeString = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const normalizeOptionalString = (value: unknown): string | null => {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
};

const mapClientProfile = (client: {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: client.id,
  name: client.fullName,
  displayName: client.fullName,
  email: client.email,
  phone: client.phone,
  notes: client.notes,
  status: client.status,
  linked: client.userId !== null,
  active: client.status.toLowerCase() === "active",
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
});

clientsRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const name = normalizeString(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const emailInput = normalizeOptionalString(req.body?.email)?.toLowerCase() ?? "";
  const phone = normalizeOptionalString(req.body?.phone);
  const notes = normalizeOptionalString(req.body?.notes);

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const client = await prisma.clientProfile.create({
      data: {
        trainerId: trainerProfile.id,
        fullName: name,
        email: emailInput,
        phone,
        notes,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({ client: mapClientProfile(client) });
  } catch (error) {
    console.error("[clients:create] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

clientsRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const clients = await prisma.clientProfile.findMany({
      where: { trainerId: trainerProfile.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ clients: clients.map(mapClientProfile) });
  } catch (error) {
    console.error("[clients:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

clientsRouter.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const client = await prisma.clientProfile.findFirst({
      where: {
        id: clientId,
        trainerId: trainerProfile.id,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!client) {
      return res.status(404).json({ message: "Not found" });
    }

    return res.json({ client: mapClientProfile(client) });
  } catch (error) {
    console.error("[clients:get] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

clientsRouter.get("/:id/assignments", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const client = await prisma.clientProfile.findFirst({
      where: {
        id: clientId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!client) {
      return res.status(404).json({ message: "Not found" });
    }

    const assignments = await prisma.assignedPlan.findMany({
      where: {
        clientId: client.id,
        plan: {
          trainerId: trainerProfile.id,
        },
      },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        clientId: true,
        planId: true,
        active: true,
        assignedAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    return res.json({
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        clientId: assignment.clientId,
        planId: assignment.planId,
        active: assignment.active,
        assignedAt: assignment.assignedAt,
        plan: {
          id: assignment.plan.id,
          name: assignment.plan.name,
          description: assignment.plan.description,
        },
      })),
    });
  } catch (error) {
    console.error("[clients:assignments] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

clientsRouter.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, "name");
  const hasEmail = Object.prototype.hasOwnProperty.call(req.body ?? {}, "email");
  const hasPhone = Object.prototype.hasOwnProperty.call(req.body ?? {}, "phone");
  const hasNotes = Object.prototype.hasOwnProperty.call(req.body ?? {}, "notes");
  const hasStatus = Object.prototype.hasOwnProperty.call(req.body ?? {}, "status");

  const name = normalizeString(req.body?.name);
  if (hasName && !name) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const email = normalizeOptionalString(req.body?.email)?.toLowerCase() ?? "";
  const phone = normalizeOptionalString(req.body?.phone);
  const notes = normalizeOptionalString(req.body?.notes);
  const status = normalizeString(req.body?.status);
  if (hasStatus && !status) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const updateData: {
    fullName?: string;
    email?: string;
    phone?: string | null;
    notes?: string | null;
    status?: string;
  } = {};

  if (hasName) updateData.fullName = name;
  if (hasEmail) updateData.email = email;
  if (hasPhone) updateData.phone = phone;
  if (hasNotes) updateData.notes = notes;
  if (hasStatus) updateData.status = status;

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existing = await prisma.clientProfile.findFirst({
      where: {
        id: clientId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const client = await prisma.clientProfile.update({
      where: { id: existing.id },
      data: updateData,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        notes: true,
        status: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.json({ client: mapClientProfile(client) });
  } catch (error) {
    console.error("[clients:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

clientsRouter.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existing = await prisma.clientProfile.findFirst({
      where: {
        id: clientId,
        trainerId: trainerProfile.id,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.clientProfile.delete({
      where: { id: existing.id },
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("[clients:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const clientAssignmentsRouter = Router();

clientAssignmentsRouter.patch("/:assignmentId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const assignmentIdParam = req.params.assignmentId;
  const assignmentId = Array.isArray(assignmentIdParam) ? assignmentIdParam[0] : assignmentIdParam;
  if (!assignmentId) {
    return res.status(404).json({ message: "Not found" });
  }

  const activeInput = req.body?.active;
  if (typeof activeInput !== "boolean") {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existing = await prisma.assignedPlan.findFirst({
      where: {
        id: assignmentId,
        client: { trainerId: trainerProfile.id },
        plan: { trainerId: trainerProfile.id },
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const updated = await prisma.assignedPlan.update({
      where: { id: existing.id },
      data: { active: activeInput },
      select: {
        id: true,
        clientId: true,
        planId: true,
        active: true,
        assignedAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    return res.json({
      assignment: {
        id: updated.id,
        clientId: updated.clientId,
        planId: updated.planId,
        active: updated.active,
        assignedAt: updated.assignedAt,
        plan: {
          id: updated.plan.id,
          name: updated.plan.name,
          description: updated.plan.description,
        },
      },
    });
  } catch (error) {
    console.error("[client-assignments:update] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

clientAssignmentsRouter.delete("/:assignmentId", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const assignmentIdParam = req.params.assignmentId;
  const assignmentId = Array.isArray(assignmentIdParam) ? assignmentIdParam[0] : assignmentIdParam;
  if (!assignmentId) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });

    if (!trainerProfile) {
      return res.status(500).json({ message: "Internal server error" });
    }

    const existing = await prisma.assignedPlan.findFirst({
      where: {
        id: assignmentId,
        client: { trainerId: trainerProfile.id },
        plan: { trainerId: trainerProfile.id },
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    await prisma.assignedPlan.delete({
      where: { id: existing.id },
    });

    return res.json({ deleted: true, assignmentId: existing.id });
  } catch (error) {
    console.error("[client-assignments:delete] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const progressLogSelect = {
  id: true,
  clientId: true,
  date: true,
  bodyWeight: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

clientsRouter.get("/:clientId/progress-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 200);

  try {
    const trainerProfile = await prisma.trainerProfile.findUnique({
      where: { userId: req.user.userId },
      select: { id: true },
    });
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await prisma.clientProfile.findFirst({
      where: { id: clientId, trainerId: trainerProfile.id },
      select: { id: true },
    });
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const progressLogs = await prisma.progressLog.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { date: "desc" },
      take: limit,
      select: progressLogSelect,
    });

    return res.json({ progressLogs });
  } catch (error) {
    console.error("[clients:progress-logs:list] error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { clientsRouter, clientAssignmentsRouter };
