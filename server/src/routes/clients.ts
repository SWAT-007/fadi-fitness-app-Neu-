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

export { clientsRouter };
