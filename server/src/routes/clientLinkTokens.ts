import crypto from "crypto";
import { Router } from "express";
import bcrypt from "bcrypt";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { unexpectedErrorResponse } from "../utils/errors";

const clientLinkTokensRouter = Router();

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const normalizeName = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const normalizePassword = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value;
};

const hashInviteToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const isInviteExpired = (expiresAt: Date) => expiresAt.getTime() <= Date.now();

const loadInviteToken = async (rawToken: string) => {
  const tokenHash = hashInviteToken(rawToken);
  return prisma.clientLinkToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      trainerId: true,
      email: true,
      expiresAt: true,
      consumedAt: true,
      trainer: {
        select: {
          user: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });
};

clientLinkTokensRouter.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const email = normalizeEmail(req.body?.email);
  if (!email || !isValidEmail(email)) {
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

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.clientLinkToken.create({
      data: {
        trainerId: trainerProfile.id,
        email,
        tokenHash,
        expiresAt,
      },
    });

    return res.status(201).json({ token, expiresAt });
  } catch (error) {
    return unexpectedErrorResponse(res, "client-link-tokens:create", error, {
      userId: req.user?.userId,
      role: req.user?.role,
      email,
    });
  }
});

clientLinkTokensRouter.get("/accept/:token", async (req, res) => {
  const tokenParam = req.params.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  if (!token) {
    return res.status(404).json({ ok: false, message: "Einladungslink wurde nicht gefunden." });
  }

  try {
    const invite = await loadInviteToken(token);
    if (!invite) {
      return res.status(404).json({ ok: false, message: "Einladungslink wurde nicht gefunden." });
    }

    if (invite.consumedAt) {
      return res.status(409).json({ ok: false, message: "Einladungslink wurde bereits verwendet." });
    }

    if (isInviteExpired(invite.expiresAt)) {
      return res.status(410).json({ ok: false, message: "Einladungslink ist abgelaufen." });
    }

    return res.json({
      ok: true,
      invite: {
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
        trainerName: invite.trainer.user.fullName,
      },
    });
  } catch (error) {
    return unexpectedErrorResponse(res, "client-link-tokens:accept:get", error, {
      tokenPresent: Boolean(token),
    });
  }
});

clientLinkTokensRouter.post("/accept/:token", async (req, res) => {
  const tokenParam = req.params.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  if (!token) {
    return res.status(404).json({ ok: false, message: "Einladungslink wurde nicht gefunden." });
  }

  const fullName = normalizeName(req.body?.fullName);
  const email = normalizeEmail(req.body?.email);
  const password = normalizePassword(req.body?.password);

  if (!fullName || !email || password.length < 6) {
    return res.status(400).json({ ok: false, message: "Ungültige Anfrage." });
  }

  try {
    const invite = await loadInviteToken(token);
    if (!invite) {
      return res.status(404).json({ ok: false, message: "Einladungslink wurde nicht gefunden." });
    }

    if (invite.consumedAt) {
      return res.status(409).json({ ok: false, message: "Einladungslink wurde bereits verwendet." });
    }

    if (isInviteExpired(invite.expiresAt)) {
      return res.status(410).json({ ok: false, message: "Einladungslink ist abgelaufen." });
    }

    if (normalizeEmail(invite.email) !== email) {
      return res.status(400).json({ ok: false, message: "Diese Einladung gilt für eine andere E-Mail-Adresse." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const consumedAt = new Date();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingUser = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          clientProfile: {
            select: {
              id: true,
              trainerId: true,
            },
          },
        },
      });

      const existingClientProfile = await tx.clientProfile.findFirst({
        where: {
          trainerId: invite.trainerId,
          email,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
        },
      });

      if (existingUser && existingUser.role !== UserRole.CLIENT) {
        throw new Error("Diese E-Mail-Adresse gehört bereits zu einem Trainerkonto.");
      }

      if (existingUser?.clientProfile && existingUser.clientProfile.trainerId !== invite.trainerId) {
        throw new Error("Dieses Client-Konto ist bereits einem anderen Trainer zugeordnet.");
      }

      if (
        existingClientProfile?.userId &&
        (!existingUser || existingClientProfile.userId !== existingUser.id)
      ) {
        throw new Error("Für diese Einladung existiert bereits ein verknüpftes Client-Profil.");
      }

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              fullName,
              passwordHash,
              role: UserRole.CLIENT,
            },
            select: { id: true, email: true },
          })
        : await tx.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.CLIENT,
              fullName,
            },
            select: { id: true, email: true },
          });

      let clientProfileId = existingUser?.clientProfile?.id ?? null;

      if (existingClientProfile && !existingClientProfile.userId) {
        const linkedProfile = await tx.clientProfile.update({
          where: { id: existingClientProfile.id },
          data: {
            userId: user.id,
            fullName,
            email,
            status: "active",
          },
          select: { id: true },
        });
        clientProfileId = linkedProfile.id;
      } else if (!existingUser?.clientProfile) {
        const createdProfile = await tx.clientProfile.create({
          data: {
            userId: user.id,
            trainerId: invite.trainerId,
            fullName,
            email,
            status: "active",
          },
          select: { id: true },
        });
        clientProfileId = createdProfile.id;
      }

      await tx.clientLinkToken.update({
        where: { id: invite.id },
        data: { consumedAt },
      });

      return {
        clientProfileId,
        email: user.email,
        fullName,
      };
    });

    return res.json({
      ok: true,
      client: {
        clientProfileId: result.clientProfileId,
        email: result.email,
        fullName: result.fullName,
      },
      message: "Einladung erfolgreich angenommen.",
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Diese E-Mail-Adresse ist bereits vergeben." });
    }

    if (error instanceof Error) {
      const expectedErrorMessages = new Set([
        "Diese E-Mail-Adresse gehÃ¶rt bereits zu einem Trainerkonto.",
        "Dieses Client-Konto ist bereits einem anderen Trainer zugeordnet.",
        "FÃ¼r diese Einladung existiert bereits ein verknÃ¼pftes Client-Profil.",
      ]);

      if (expectedErrorMessages.has(error.message)) {
        return res.status(400).json({ ok: false, message: error.message });
      }
    }

    return unexpectedErrorResponse(res, "client-link-tokens:accept:post", error, {
      email,
      fullNameLength: fullName.length,
      tokenPresent: Boolean(token),
    });
  }
});

export { clientLinkTokensRouter };
