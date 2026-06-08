// Express factory. Kept independent of Socket.IO so unit tests (or alternate
// transports) can mount the same HTTP routes without booting the whole stack.

import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import type { LogEnvelope, SessionAnalysis } from "@ispyai/shared";
import type { LogAnalyzer } from "./ai/LogAnalyzer.js";
import type { SessionAnalyzer } from "./ai/SessionAnalyzer.js";
import type { SessionStore } from "./store/SessionStore.js";
import { logsRouter } from "./routes/logs.js";
import { sessionsRouter } from "./routes/sessions.js";

export interface AppDeps {
  store: SessionStore;
  analyzer: LogAnalyzer;
  sessionAnalyzer: SessionAnalyzer;
  /**
   * Optional broadcaster injected when Socket.IO is also in play. HTTP-fallback
   * logs go through here so dashboards still get realtime updates.
   */
  broadcastLog?: (sessionId: string, payload: LogEnvelope) => void;
  /**
   * Optional broadcaster for refreshed per-session AI reports. Wired by the
   * realtime layer so a log arriving via HTTP still re-renders the analysis.
   */
  broadcastAnalysis?: (sessionId: string, analysis: SessionAnalysis) => void;
  /** Per-session analysis trigger (debounced internally by the caller). */
  scheduleAnalysis?: (sessionId: string) => void;
  /** Allowed CORS origins. Empty array = allow everything (dev default). */
  corsOrigins?: string[];
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  // 1MB JSON ceiling matches the SDK's 64KB body cap with comfortable headroom
  // for large header maps or future fields.
  app.use(express.json({ limit: "1mb" }));
  app.use(cors(buildCorsOptions(deps.corsOrigins)));

  // Both `/healthz` (Kubernetes-style) and `/health` are exposed so dashboards
  // / load balancers built to either convention can probe the service.
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "ispyai-backend" });
  });
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ispyai-backend" });
  });

  app.use("/v1/logs", logsRouter(deps));
  app.use("/v1/sessions", sessionsRouter(deps));

  return app;
}

function buildCorsOptions(origins?: string[]): CorsOptions {
  if (!origins || origins.length === 0) {
    return { origin: true, credentials: false };
  }
  const allow = new Set(origins);
  return {
    credentials: false,
    origin: (origin, cb) => {
      if (!origin || allow.has(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
  };
}
