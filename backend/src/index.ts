// Process entry point. Wires the HTTP + Socket.IO + device WS servers,
// handles graceful shutdown, and surfaces fatal startup errors.

import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime/index.js";
import { attachDeviceWebSocket } from "./realtime/deviceWebSocket.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { SessionStore } from "./store/SessionStore.js";
import { RuleBasedAnalyzer } from "./ai/LogAnalyzer.js";
import { RuleBasedSessionAnalyzer } from "./ai/SessionAnalyzer.js";

async function main(): Promise<void> {
  const store = new SessionStore({ sessionTtlMs: config.sessionTtlMs });
  const analyzer = new RuleBasedAnalyzer();
  const sessionAnalyzer = new RuleBasedSessionAnalyzer();

  // The HTTP fallback handler needs to broadcast over the realtime namespace.
  // We use late-bound closures so the Express app can be built before
  // Socket.IO is attached to the same HTTP server.
  let realtime: ReturnType<typeof attachRealtime> | undefined;

  const app = createApp({
    store,
    analyzer,
    sessionAnalyzer,
    corsOrigins: config.corsOrigins,
    broadcastLog: (sessionId, env) => realtime?.broadcastLog(sessionId, env),
    scheduleAnalysis: (sessionId) => realtime?.scheduleAnalysis(sessionId),
  });
  const server = createServer(app);
  realtime = attachRealtime(server, {
    store,
    analyzer,
    sessionAnalyzer,
    analysisDebounceMs: config.analysisDebounceMs,
    corsOrigins: config.corsOrigins,
  });

  // Raw-WebSocket endpoint for iOS devices (URLSessionWebSocketTask cannot
  // speak Socket.IO). Mounted via an `upgrade` filter so it coexists with
  // Socket.IO on the same HTTP server.
  const deviceWS = attachDeviceWebSocket(server, {
    store,
    analyzer,
    broadcastLog: (sessionId, env) => realtime?.broadcastLog(sessionId, env),
    scheduleAnalysis: (sessionId) => realtime?.scheduleAnalysis(sessionId),
  });
  server.on("upgrade", (req, socket, head) => {
    // Socket.IO attaches its own `upgrade` listener for `/socket.io/...`;
    // returning false here means we did not consume the upgrade and Socket.IO
    // is free to handle it.
    deviceWS.upgrade(req, socket, head);
  });

  server.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        corsOrigins: config.corsOrigins,
        deviceWSPath: "/realtime/device",
      },
      "iSpyAI backend listening"
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "shutting down");
    realtime?.shutdown();
    store.shutdown();
    deviceWS.shutdown();
    realtime?.io.close(() => {
      server.close(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "failed to start backend");
  process.exit(1);
});
