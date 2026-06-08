// Raw-WS endpoint for iOS devices.
//
// Why a second WS server? `URLSessionWebSocketTask` speaks raw WebSocket
// frames; Socket.IO (used by the dashboard) speaks Engine.IO on top of WS,
// which raw clients cannot satisfy without a Socket.IO-compatible library.
// Rather than pull a Socket.IO Swift dep onto the device, we expose a small
// JSON-over-WS protocol here and re-broadcast through the existing Socket.IO
// fan-out so dashboards see the same envelopes.
//
// Wire format (all JSON-encoded text frames):
//   - From device: { "type": "hello", "sessionId": ..., "deviceName"?, "appVersion"?, "buildNumber"? }
//   - From device: { "type": "log",   "log": <APILog> }
//   - From server: { "type": "ack",   "ok": true }
//   - From server: { "type": "error", "message": string }
//
// Path: `/realtime/device`. Mounted alongside the Socket.IO namespace by
// filtering on the upgrade URL in `index.ts`.

import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";

import type { LogEnvelope } from "@ispyai/shared";
import type { LogAnalyzer } from "../ai/LogAnalyzer.js";
import type { SessionStore } from "../store/SessionStore.js";
import { apiLogSchema, deviceHelloSchema } from "../schema.js";
import { logger } from "../logger.js";

export const DEVICE_WS_PATH = "/realtime/device";

export interface DeviceWSOptions {
  store: SessionStore;
  analyzer: LogAnalyzer;
  /** Broadcaster to fan freshly-analysed logs to dashboards (Socket.IO). */
  broadcastLog: (sessionId: string, envelope: LogEnvelope) => void;
  /** Trigger a debounced session-level analysis re-run. */
  scheduleAnalysis: (sessionId: string) => void;
}

export interface DeviceWSHandle {
  wss: WebSocketServer;
  /** Pluggable into `http.Server.on("upgrade", handle.upgrade)`. */
  upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean;
  shutdown: () => void;
}

// `deviceHelloSchema.shape` is spread here so the hello frame stays in
// lockstep with the HTTP fallback (`/v1/sessions`). `apiLogSchema` likewise
// powers the log frame (`/v1/logs`).
const incomingFrame = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    ...deviceHelloSchema.shape,
  }),
  z.object({
    type: z.literal("log"),
    log: apiLogSchema,
  }),
]);

export function attachDeviceWebSocket(
  server: HttpServer,
  options: DeviceWSOptions
): DeviceWSHandle {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1_024 * 1_024 });

  const upgrade = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): boolean => {
    if (!req.url) return false;
    const path = req.url.split("?")[0];
    if (path !== DEVICE_WS_PATH) return false;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
    return true;
  };

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    logger.debug({ remote: req.socket.remoteAddress }, "device WS connected");
    let sessionId: string | undefined;

    ws.on("message", async (raw) => {
      let parsed: z.infer<typeof incomingFrame>;
      try {
        parsed = incomingFrame.parse(JSON.parse(String(raw)));
      } catch (err) {
        sendError(ws, "invalid_frame");
        logger.warn({ err }, "rejected device WS frame");
        return;
      }

      if (parsed.type === "hello") {
        sessionId = parsed.sessionId;
        options.store.upsertFromHello({
          sessionId: parsed.sessionId,
          deviceName: parsed.deviceName,
          appVersion: parsed.appVersion,
          buildNumber: parsed.buildNumber,
        });
        sendAck(ws);
        return;
      }

      const log = parsed.log;
      try {
        const analysis = await options.analyzer.analyze(log);
        const envelope: LogEnvelope = { log, analysis };
        options.store.recordLog(envelope);
        const sid = log.sessionId ?? sessionId ?? "unknown";
        options.broadcastLog(sid, envelope);
        options.scheduleAnalysis(sid);
        sendAck(ws);
      } catch (err) {
        logger.warn({ err }, "device WS analyse failed");
        sendError(ws, "ingest_failed");
      }
    });

    ws.on("close", () => {
      logger.debug({ sessionId }, "device WS closed");
    });
    ws.on("error", (err) => {
      logger.warn({ err, sessionId }, "device WS error");
    });
  });

  return {
    wss,
    upgrade,
    shutdown: () => wss.close(),
  };
}

function sendAck(ws: WebSocket): void {
  try {
    ws.send(JSON.stringify({ type: "ack", ok: true }));
  } catch {
    // Ignore - the next send will fail if the socket is really gone.
  }
}

function sendError(ws: WebSocket, message: string): void {
  try {
    ws.send(JSON.stringify({ type: "error", message }));
  } catch {
    // Ignore - socket may already be torn down.
  }
}
