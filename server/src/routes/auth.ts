import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

const authRouter = Router();

type RegisterRole = "trainer" | "client";

const normalizeRole = (value: unknown): RegisterRole | null => {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (role === "trainer" || role === "client") return role;
  return null;
};

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const normalizePassword = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value;
};

const fallbackFullNameFromEmail = (email: string): string => {
  const localPart = email.split("@")[0] || "user";
  return localPart.slice(0, 80);
};

const createToken = (userId: string, role: RegisterRole): string | null => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;
  return jwt.sign({ sub: userId, role }, jwtSecret, { expiresIn: "7d" });
};

authRouter.post("/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizePassword(req.body?.password);
  const role = normalizeRole(req.body?.role);

  if (!email || !password || password.length < 6 || !role) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: role.toUpperCase() as "TRAINER" | "CLIENT",
        fullName: fallbackFullNameFromEmail(email),
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    const token = createToken(user.id, role);
    if (!token) {
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role,
      },
    });
  } catch (error) {
    console.error("[register] error:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Email already in use" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
});

authRouter.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizePassword(req.body?.password);

  if (!email || !password) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const role = user.role.toLowerCase() as RegisterRole;
    const token = createToken(user.id, role);
    if (!token) {
      return res.status(500).json({ message: "Internal server error" });
    }

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role,
      },
    });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

export { authRouter };
