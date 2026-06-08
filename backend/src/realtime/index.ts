// Socket.IO realtime layer. Two audiences share the same namespace:
//   1. iOS devices: announce a hello, then push logs as they're captured.
//   2. Dashboards: receive a session snapshot, then live log envelopes for
//      whichever sessions the dashboard has joined.
//
// Sessions are represented as Socket.IO rooms keyed by sessionId so a single
// dashboard can fan out across many devices.

import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import {
  REALTIME_NAMESPACE,
  WSEvents,
  type AnalysisUpdatedPayload,
  type DeviceHelloPayload,
  type DeviceLogPayload,
  type LogNewPayload,
  type SessionRoomPayload,
  type SessionsSnapshotPayload,
} from "@ispyai/shared";
import type { LogAnalyzer } from "../ai/LogAnalyzer.js";
import type { SessionAnalyzer } from "../ai/SessionAnalyzer.js";
import type { SessionStore } from "../store/SessionStore.js";
import { apiLogSchema, deviceHelloSchema } from "../schema.js";
import { logger } from "../logger.js";

interface RealtimeDeps {
  store: SessionStore;
  analyzer: LogAnalyzer;
  sessionAnalyzer: SessionAnalyzer;
  /** Debounce window for per-session report recomputation. */
  analysisDebounceMs: number;
  /** CORS allowlist; empty array means allow everything (dev). */
  corsOrigins: string[];
}

export interface RealtimeHandle {
  io: IOServer;
  /** Trigger a debounced per-session analysis recompute + broadcast. */
  scheduleAnalysis: (sessionId: string) => void;
  /** Broadcast a fresh log to subscribed dashboards. */
  broadcastLog: (sessionId: string, envelope: LogNewPayload) => void;
  /** Stop background timers (used by graceful shutdown + tests). */
  shutdown: () => void;
}

export function attachRealtime(
  server: HttpServer,
  deps: RealtimeDeps
): RealtimeHandle {
  const io = new IOServer(server, {
    cors: buildSocketCors(deps.corsOrigins),
    // 2MB margin above the SDK's body cap to allow base64 / header overhead.
    maxHttpBufferSize: 2 * 1024 * 1024,
  });

  const ns = io.of(REALTIME_NAMESPACE);

  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const recomputeAndBroadcast = async (sessionId: string): Promise<void> => {
    try {
      const envelopes = deps.store.getRecentLogs(sessionId);
      const analysis = await deps.sessionAnalyzer.analyze({
        sessionId,
        envelopes,
      });
      deps.store.setAnalysis(sessionId, analysis);
      const payload: AnalysisUpdatedPayload = { analysis };
      ns.to(roomFor(sessionId)).emit(WSEvents.AnalysisUpdated, payload);
    } catch (err) {
      logger.warn({ err, sessionId }, "session analysis failed");
    }
  };

  const scheduleAnalysis = (sessionId: string): void => {
    const existing = debounceTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      debounceTimers.delete(sessionId);
      void recomputeAndBroadcast(sessionId);
    }, deps.analysisDebounceMs);
    handle.unref?.();
    debounceTimers.set(sessionId, handle);
  };

  const broadcastLog = (sessionId: string, envelope: LogNewPayload): void => {
    ns.to(roomFor(sessionId)).emit(WSEvents.LogNew, envelope);
    ns.emit(WSEvents.SessionsSnapshot, {
      sessions: deps.store.listSessions(),
    } satisfies SessionsSnapshotPayload);
  };

  ns.on("connection", (socket: Socket) => {
    logger.debug({ id: socket.id }, "realtime connection");

    // New connections immediately get the current session list. Dashboards
    // render this directly; devices simply ignore the snapshot.
    socket.emit(WSEvents.SessionsSnapshot, {
      sessions: deps.store.listSessions(),
    } satisfies SessionsSnapshotPayload);

    socket.on(WSEvents.DeviceHello, (payload: DeviceHelloPayload) => {
      const parsed = deviceHelloSchema.safeParse(payload);
      if (!parsed.success) {
        logger.warn({ id: socket.id }, "rejected device:hello");
        return;
      }
      const session = deps.store.upsertFromHello(parsed.data);
      // Devices auto-join their own session room so logs only fan to dashboards
      // that explicitly subscribed.
      socket.join(roomFor(session.id));
      ns.emit(WSEvents.SessionsSnapshot, {
        sessions: deps.store.listSessions(),
      } satisfies SessionsSnapshotPayload);
    });

    socket.on(WSEvents.DeviceLog, async (payload: DeviceLogPayload) => {
      const parsed = apiLogSchema.safeParse(payload?.log);
      if (!parsed.success) {
        logger.warn(
          { id: socket.id, errors: parsed.error.flatten() },
          "rejected device:log"
        );
        return;
      }
      const log = parsed.data;
      const analysis = await deps.analyzer.analyze(log);
      const envelope: LogNewPayload = { log, analysis };

      deps.store.recordLog(envelope);

      const sessionId = log.sessionId ?? "unknown";
      broadcastLog(sessionId, envelope);
      scheduleAnalysis(sessionId);
    });

    socket.on(WSEvents.SessionJoined, (payload: SessionRoomPayload) => {
      if (!payload?.sessionId) return;
      socket.join(roomFor(payload.sessionId));
      // Backfill recent logs so a freshly opened dashboard sees history.
      for (const env of deps.store.getRecentLogs(payload.sessionId)) {
        socket.emit(WSEvents.LogNew, env);
      }
      // Also push the most recent analysis if available.
      const existing = deps.store.getAnalysis(payload.sessionId);
      if (existing) {
        socket.emit(WSEvents.AnalysisUpdated, {
          analysis: existing,
        } satisfies AnalysisUpdatedPayload);
      }
    });

    socket.on(WSEvents.SessionLeft, (payload: SessionRoomPayload) => {
      if (!payload?.sessionId) return;
      socket.leave(roomFor(payload.sessionId));
    });

    socket.on("disconnect", (reason) => {
      logger.debug({ id: socket.id, reason }, "realtime disconnect");
    });
  });

  const shutdown = (): void => {
    for (const [, handle] of debounceTimers) clearTimeout(handle);
    debounceTimers.clear();
  };

  return { io, scheduleAnalysis, broadcastLog, shutdown };
}

function buildSocketCors(origins: string[]): {
  origin: boolean | string[];
  credentials: boolean;
} {
  if (origins.length === 0) return { origin: true, credentials: false };
  return { origin: origins, credentials: false };
}

function roomFor(sessionId: string): string {
  return `session:${sessionId}`;
}
