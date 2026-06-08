// HTTP fallback for log delivery. Devices use this when the WebSocket isn't
// connected (initial boot, transient network failure, etc.).

import { Router } from "express";
import type { LogEnvelope } from "@ispyai/shared";
import type { AppDeps } from "../app.js";
import { apiLogSchema } from "../schema.js";
import { logger } from "../logger.js";

export function logsRouter(deps: AppDeps): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = apiLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_log",
        details: parsed.error.flatten(),
      });
    }

    const log = parsed.data;
    const analysis = await deps.analyzer.analyze(log);
    const envelope: LogEnvelope = { log, analysis };

    deps.store.recordLog(envelope);

    const sessionId = log.sessionId ?? "unknown";
    if (deps.broadcastLog) deps.broadcastLog(sessionId, envelope);
    if (deps.scheduleAnalysis) deps.scheduleAnalysis(sessionId);

    logger.debug(
      { sessionId, statusCode: log.statusCode },
      "log accepted via HTTP"
    );
    res.status(202).json({ ok: true });
  });

  return router;
}
