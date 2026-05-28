import type { Response } from "express";

type ErrorMeta = Record<string, unknown> | undefined;

const SENSITIVE_KEY_PATTERN = /(password|token|authorization|backend[_-]?token|cookie|secret)/i;

const randomSuffix = (): string =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

export const createErrorId = (): string => {
  const now = new Date();
  const datePart = [
    now.getUTCFullYear().toString(),
    (now.getUTCMonth() + 1).toString().padStart(2, "0"),
    now.getUTCDate().toString().padStart(2, "0"),
  ].join("");

  return `ERR-${datePart}-${randomSuffix()}`;
};

const sanitizeMeta = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitizeMeta);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitizeMeta(raw);
  }
  return output;
};

export const logError = (
  errorId: string,
  context: string,
  error: unknown,
  meta?: ErrorMeta,
) => {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const stack = error instanceof Error ? error.stack : undefined;
  const safeMeta = sanitizeMeta(meta);

  console.error("[backend:error]", {
    errorId,
    context,
    message,
    stack,
    meta: safeMeta,
  });
};

export const errorResponse = (
  res: Response,
  status: number,
  message: string,
  errorId?: string,
) => {
  return res.status(status).json({
    ok: false,
    message,
    ...(errorId ? { errorId } : {}),
  });
};

export const unexpectedErrorResponse = (
  res: Response,
  context: string,
  error: unknown,
  meta?: ErrorMeta,
) => {
  const errorId = createErrorId();
  logError(errorId, context, error, meta);
  return errorResponse(res, 500, "Interner Serverfehler.", errorId);
};

