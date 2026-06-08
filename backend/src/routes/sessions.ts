// HTTP-side of the session bootstrap. Devices call POST to announce themselves;
// dashboards GET to backfill state outside the realtime stream.

import { Router } from "express";
import type { AppDeps } from "../app.js";
import { deviceHelloSchema } from "../schema.js";
import { logger } from "../logger.js";

export function sessionsRouter(deps: AppDeps): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ sessions: deps.store.listSessions() });
  });

  router.post("/", (req, res) => {
    const parsed = deviceHelloSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_hello",
        details: parsed.error.flatten(),
      });
    }

    const session = deps.store.upsertFromHello(parsed.data);
    logger.info(
      { sessionId: session.id, deviceName: session.deviceName },
      "session hello"
    );
    res.status(201).json({ session });
  });

  router.get("/:id", (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "missing_id" });
    const session = deps.store.getSession(id);
    if (!session) return res.status(404).json({ error: "session_not_found" });
    res.json({ session });
  });

  router.get("/:id/logs", (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "missing_id" });
    res.json({ logs: deps.store.getRecentLogs(id) });
  });

  router.get("/:id/analysis", async (req, res) => {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: "missing_id" });
    if (!deps.store.hasSession(id)) {
      return res.status(404).json({ error: "session_not_found" });
    }

    // Cache miss is fine: compute on demand so a freshly-opened share link
    // always renders an analysis even before a new log triggers a refresh.
    let analysis = deps.store.getAnalysis(id);
    if (!analysis) {
      const envelopes = deps.store.getRecentLogs(id);
      analysis = await deps.sessionAnalyzer.analyze({ sessionId: id, envelopes });
      deps.store.setAnalysis(id, analysis);
    }
    res.json({ analysis });
  });

  return router;
}
