import { NotificationType } from "@prisma/client";
import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { unexpectedErrorResponse } from "../utils/errors";

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

const messageSelect = {
  id: true,
  senderId: true,
  receiverId: true,
  content: true,
  createdAt: true,
  readAt: true,
  sender: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} as const;

const resolveTrainerProfile = async (userId: string) => {
  return prisma.trainerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
    },
  });
};

const resolveOwnedClientProfile = async (trainerId: string, clientId: string) => {
  return prisma.clientProfile.findFirst({
    where: { id: clientId, trainerId },
    select: {
      id: true,
      userId: true,
      fullName: true,
      email: true,
      status: true,
    },
  });
};

clientsRouter.get("/exercise-change-requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const statusQuery = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
  const whereStatus =
    !statusQuery || statusQuery === "pending"
      ? { equals: "pending", mode: "insensitive" as const }
      : statusQuery === "all"
        ? undefined
        : { equals: statusQuery, mode: "insensitive" as const };

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const requests = await prisma.exerciseChangeRequest.findMany({
      where: {
        ...(whereStatus ? { status: whereStatus } : {}),
        client: { trainerId: trainerProfile.id },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        client: {
          select: {
            fullName: true,
            userId: true,
          },
        },
        exercise: {
          select: {
            name: true,
          },
        },
      },
    });

    return res.json({
      requests: requests.map((request) => ({
        id: request.id,
        reason: request.reason,
        status: request.status,
        created_at: request.createdAt.toISOString(),
        clients: {
          full_name: request.client.fullName,
          user_id: request.client.userId,
        },
        exercises: {
          name: request.exercise.name,
        },
      })),
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:exercise-change-requests:list", error);
  }
});

clientsRouter.patch(
  "/exercise-change-requests/:requestId",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    if (req.user?.role !== "trainer") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const requestIdParam = req.params.requestId;
    const requestId = Array.isArray(requestIdParam) ? requestIdParam[0] : requestIdParam;
    if (!requestId) {
      return res.status(404).json({ message: "Not found" });
    }

    const statusInput = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
    if (statusInput !== 'resolved' && statusInput !== 'rejected') {
      return res.status(400).json({ message: "Invalid request" });
    }

    try {
      const trainerProfile = await resolveTrainerProfile(req.user.userId);
      if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

      const existing = await prisma.exerciseChangeRequest.findFirst({
        where: {
          id: requestId,
          client: { trainerId: trainerProfile.id },
        },
        select: {
          id: true,
          client: {
            select: {
              userId: true,
            },
          },
          exercise: {
            select: {
              name: true,
            },
          },
          reason: true,
          status: true,
          createdAt: true,
        },
      });

      if (!existing) {
        return res.status(404).json({ message: "Not found" });
      }

      const updated = await prisma.exerciseChangeRequest.update({
        where: { id: existing.id },
        data: { status: statusInput },
        select: {
          id: true,
          reason: true,
          status: true,
          createdAt: true,
        },
      });

      let notificationCreated = false;
      if (existing.client.userId) {
        try {
          await prisma.notification.create({
            data: {
              userId: existing.client.userId,
              type: NotificationType.REQUEST,
              title:
                statusInput === 'resolved'
                  ? "Deine Anfrage wurde akzeptiert"
                  : "Deine Anfrage wurde abgelehnt",
              body: existing.exercise.name,
            },
          });
          notificationCreated = true;
        } catch (notifError) {
          console.error("[clients:exercise-change-requests:update] notification error:", notifError);
        }
      }

      return res.json({
        request: {
          id: updated.id,
          reason: updated.reason,
          status: updated.status,
          created_at: updated.createdAt.toISOString(),
        },
        notificationCreated,
      });
    } catch (error) {
            return unexpectedErrorResponse(res, "clients:exercise-change-requests:update", error);
    }
  },
);

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
        return unexpectedErrorResponse(res, "clients:create", error);
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
        return unexpectedErrorResponse(res, "clients:list", error);
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
        return unexpectedErrorResponse(res, "clients:get", error);
  }
});

clientsRouter.get("/:clientId/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  const rawLimit = parseInt(String(req.query.limit ?? "100"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 100 : Math.min(rawLimit, 300);

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    if (!clientProfile.userId) {
      return res.json({
        client: clientProfile,
        messages: [],
      });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: req.user.userId, receiverId: clientProfile.userId },
          { senderId: clientProfile.userId, receiverId: req.user.userId },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: messageSelect,
    });

    return res.json({
      client: clientProfile,
      messages,
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:messages:list", error);
  }
});

clientsRouter.post("/:clientId/messages", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    return res.status(400).json({ message: "Content required" });
  }

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ message: "Not found" });
    if (!clientProfile.userId) {
      return res.status(400).json({ message: "Client has no linked user" });
    }

    const message = await prisma.message.create({
      data: {
        senderId: req.user.userId,
        receiverId: clientProfile.userId,
        content,
      },
      select: messageSelect,
    });

    let notificationCreated = false;
    try {
      const shortBody = content.length > 80 ? `${content.slice(0, 77)}...` : content;
      await prisma.notification.create({
        data: {
          userId: clientProfile.userId,
          type: NotificationType.MESSAGE,
          title: "Neue Nachricht von deinem Trainer",
          body: shortBody,
        },
      });
      notificationCreated = true;
    } catch (notifError) {
      console.error("[clients:messages:create] notification error:", notifError);
    }

    return res.status(201).json({ message, notificationCreated });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:messages:create", error);
  }
});

clientsRouter.post("/:clientId/messages/read", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ message: "Not found" });
    if (!clientProfile.userId) {
      return res.json({ updatedCount: 0 });
    }

    const result = await prisma.message.updateMany({
      where: {
        senderId: clientProfile.userId,
        receiverId: req.user.userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return res.json({ updatedCount: result.count });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:messages:read", error);
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
        return unexpectedErrorResponse(res, "clients:assignments", error);
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
        return unexpectedErrorResponse(res, "clients:update", error);
  }
});

clientsRouter.post("/:id/reset-password", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }

  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!clientId) {
    return res.status(400).json({ ok: false, message: "Invalid request" });
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || password.length < 6) {
    return res.status(400).json({ ok: false, message: "Passwort muss mindestens 6 Zeichen haben." });
  }

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ ok: false, message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ ok: false, message: "Not found" });
    if (!clientProfile.userId) {
      return res.status(400).json({ ok: false, message: "Der Kunde hat noch keinen App-Zugang." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: clientProfile.userId },
      data: { passwordHash, isActive: true },
      select: { id: true },
    });

    return res.json({ ok: true, message: "Passwort wurde zurueckgesetzt." });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:reset-password", error);
  }
});

clientsRouter.post("/:id/app-access", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!clientId) {
    return res.status(400).json({ message: "Invalid request" });
  }

  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || password.length < 6) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const normalizedEmail = clientProfile.email.trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Client has no email" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          role: true,
          clientProfile: {
            select: {
              id: true,
            },
          },
        },
      });

      if (existingUser && existingUser.role !== "CLIENT") {
        throw new Error("Email belongs to a trainer account");
      }

      if (
        existingUser?.clientProfile &&
        existingUser.clientProfile.id !== clientProfile.id
      ) {
        throw new Error("Email already linked to a different client");
      }

      let userCreated = false;
      let userLinked = false;

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              passwordHash,
              role: "CLIENT",
              isActive: true,
            },
            select: { id: true, email: true },
          })
        : await tx.user.create({
            data: {
              email: normalizedEmail,
              passwordHash,
              role: "CLIENT",
              fullName: clientProfile.fullName,
              isActive: true,
            },
            select: { id: true, email: true },
          });

      if (!existingUser) {
        userCreated = true;
      }

      if (clientProfile.userId !== user.id) {
        await tx.clientProfile.update({
          where: { id: clientProfile.id },
          data: {
            userId: user.id,
            email: normalizedEmail,
            fullName: clientProfile.fullName,
            status: "active",
          },
          select: { id: true },
        });
        userLinked = true;
      }

      return {
        user,
        userCreated,
        userLinked,
      };
    });

    return res.json({
      client: {
        id: clientProfile.id,
        userId: clientProfile.userId ?? result.user.id,
        email: normalizedEmail,
      },
      userCreated: result.userCreated,
      userLinked: result.userLinked,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Email belongs to a trainer account") {
        return res.status(409).json({ message: "Diese E-Mail gehört zu einem Trainerkonto." });
      }
      if (error.message === "Email already linked to a different client") {
        return res.status(409).json({ message: "Diese E-Mail ist bereits einem anderen Client zugeordnet." });
      }
    }
        return unexpectedErrorResponse(res, "clients:app-access:create", error);
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
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }

    const deleteResult = await prisma.$transaction(async (tx) => {
      let userDeactivated = false;
      let notificationsCleaned = 0;
      let messagesCleaned = 0;

      if (existing.userId) {
        const updatedUser = await tx.user.updateMany({
          where: {
            id: existing.userId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
        userDeactivated = updatedUser.count > 0;

        const notificationsResult = await tx.notification.deleteMany({
          where: { userId: existing.userId },
        });
        notificationsCleaned = notificationsResult.count;

        const messagesResult = await tx.message.deleteMany({
          where: {
            OR: [{ senderId: existing.userId }, { receiverId: existing.userId }],
          },
        });
        messagesCleaned = messagesResult.count;
      }

      await tx.clientProfile.delete({
        where: { id: existing.id },
      });

      return {
        deleted: true,
        id: existing.id,
        userDeactivated,
        notificationsCleaned,
        messagesCleaned,
      };
    });

    return res.json(deleteResult);
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:delete", error);
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
        return unexpectedErrorResponse(res, "client-assignments:update", error);
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
        return unexpectedErrorResponse(res, "client-assignments:delete", error);
  }
});

const weeklyCheckinSelect = {
  id: true,
  clientId: true,
  weekStart: true,
  mood: true,
  energy: true,
  sleepQuality: true,
  hunger: true,
  stress: true,
  bodyWeight: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  images: {
    select: {
      id: true,
      checkinId: true,
      storagePath: true,
      createdAt: true,
    },
  },
} as const;

clientsRouter.get("/:clientId/checkins", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100);

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

    const checkins = await prisma.weeklyCheckin.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { weekStart: "desc" },
      take: limit,
      select: weeklyCheckinSelect,
    });

    return res.json({ checkins });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:checkins:list", error);
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

const assignedNutritionPlanSelect = {
  id: true,
  clientId: true,
  planId: true,
  active: true,
  assignedAt: true,
  plan: {
    select: {
      id: true,
      name: true,
    },
  },
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
        return unexpectedErrorResponse(res, "clients:progress-logs:list", error);
  }
});

clientsRouter.get("/:clientId/nutrition-assignments", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const assignments = await prisma.assignedNutritionPlan.findMany({
      where: { clientId: clientProfile.id },
      orderBy: { assignedAt: "desc" },
      take: limit,
      select: assignedNutritionPlanSelect,
    });

    return res.json({
      assignments,
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:nutrition-assignments:list", error);
  }
});

clientsRouter.get("/:clientId/workout-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const clientIdParam = req.params.clientId;
  const clientId = Array.isArray(clientIdParam) ? clientIdParam[0] : clientIdParam;
  if (!clientId) return res.status(404).json({ message: "Not found" });

  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50;
  const completedOnly = String(req.query.completed ?? "true").toLowerCase() !== "false";
  const dateGte = typeof req.query.dateGte === "string" ? req.query.dateGte.trim() : "";
  const dateLt = typeof req.query.dateLt === "string" ? req.query.dateLt.trim() : "";

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clientProfile = await resolveOwnedClientProfile(trainerProfile.id, clientId);
    if (!clientProfile) return res.status(404).json({ message: "Not found" });

    const where = {
      clientId: clientProfile.id,
      ...(completedOnly ? { completedAt: { not: null as Date | null } } : {}),
      ...(dateGte || dateLt
        ? {
            date: {
              ...(dateGte ? { gte: dateGte } : {}),
              ...(dateLt ? { lt: dateLt } : {}),
            },
          }
        : {}),
    };

    const [totalCount, workoutLogs] = await Promise.all([
      prisma.workoutLog.count({ where }),
      prisma.workoutLog.findMany({
        where,
        orderBy: { date: "desc" },
        take: limit,
        select: {
          id: true,
          clientId: true,
          dayId: true,
          date: true,
          notes: true,
          completedAt: true,
          durationSeconds: true,
          createdAt: true,
          day: {
            select: {
              id: true,
              name: true,
              plan: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          exerciseLogs: {
            select: {
              id: true,
              setsDone: true,
              actualWeight: true,
              actualReps: true,
              completed: true,
              exercise: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return res.json({ totalCount, workoutLogs });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:workout-logs:list", error);
  }
});

clientsRouter.get("/messages/clients", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const trainerProfile = await resolveTrainerProfile(req.user.userId);
    if (!trainerProfile) return res.status(500).json({ message: "Internal server error" });

    const clients = await prisma.clientProfile.findMany({
      where: { trainerId: trainerProfile.id },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        trainerId: true,
        userId: true,
        fullName: true,
        email: true,
        phone: true,
        notes: true,
        createdAt: true,
      },
    });

    const clientUserIds = clients.map((client) => client.userId).filter(Boolean) as string[];
    const unreadBySenderId = new Map<string, number>();

    if (clientUserIds.length > 0) {
      const unreadMessages = await prisma.message.findMany({
        where: {
          senderId: { in: clientUserIds },
          receiverId: req.user.userId,
          readAt: null,
        },
        select: { senderId: true },
      });

      for (const message of unreadMessages) {
        unreadBySenderId.set(message.senderId, (unreadBySenderId.get(message.senderId) ?? 0) + 1);
      }
    }

    return res.json({
      trainerUserId: req.user.userId,
      clients: clients.map((client) => ({
        id: client.id,
        trainerId: client.trainerId,
        userId: client.userId,
        fullName: client.fullName,
        email: client.email,
        phone: client.phone,
        notes: client.notes,
        createdAt: client.createdAt,
        unreadCount: client.userId ? unreadBySenderId.get(client.userId) ?? 0 : 0,
        messagingEnabled: client.userId !== null,
      })),
    });
  } catch (error) {
        return unexpectedErrorResponse(res, "clients:messages:clients", error);
  }
});

export { clientsRouter, clientAssignmentsRouter };
