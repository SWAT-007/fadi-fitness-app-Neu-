import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AppUserRole = "trainer" | "client";

export interface AuthUser {
  userId: string;
  role: AppUserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface TokenPayload extends JwtPayload {
  sub?: string;
  role?: string;
}

const getBearerToken = (headerValue?: string): string | null => {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
};

const normalizeRole = (role?: string): AppUserRole | null => {
  if (!role) return null;
  const normalized = role.toLowerCase();
  if (normalized === "trainer" || normalized === "client") return normalized;
  return null;
};

export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.header("authorization"));
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
    const userId = typeof decoded.sub === "string" ? decoded.sub : null;
    const role = normalizeRole(decoded.role);

    if (!userId || !role) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = { userId, role };
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

