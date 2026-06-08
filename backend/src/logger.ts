import pino from "pino";
import { config } from "./config.js";

// pino-pretty is used in dev for human-readable output. Production deployments
// would typically pipe raw JSON to a log aggregator.
const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: config.logLevel,
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      }
    : undefined,
});
