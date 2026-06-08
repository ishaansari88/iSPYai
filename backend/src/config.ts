// Minimal env-driven config. Validated once at startup and frozen so hot
// reloads can't drift between modules.

import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  // Comma-separated allowlist. Empty / unset means "allow everything" which
  // is the right default in dev. Set this in any deployment past local laptops.
  CORS_ORIGINS: z.string().optional(),
  // Idle-session TTL in milliseconds. Sessions with no activity in this window
  // are evicted from the in-memory store.
  SESSION_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1_000),
  // Debounce interval for re-running the per-session analyzer when a fresh
  // log arrives. Keeps the dashboard responsive without flooding it with
  // duplicate reports under high log volume.
  ANALYSIS_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(1_000),
});

const parsed = schema.parse({
  PORT: process.env.PORT,
  LOG_LEVEL: process.env.LOG_LEVEL,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  SESSION_TTL_MS: process.env.SESSION_TTL_MS,
  ANALYSIS_DEBOUNCE_MS: process.env.ANALYSIS_DEBOUNCE_MS,
});

export const config = Object.freeze({
  port: parsed.PORT,
  logLevel: parsed.LOG_LEVEL,
  corsOrigins: (parsed.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sessionTtlMs: parsed.SESSION_TTL_MS,
  analysisDebounceMs: parsed.ANALYSIS_DEBOUNCE_MS,
});

export type AppConfig = typeof config;
