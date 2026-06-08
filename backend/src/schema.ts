// Zod schemas for inbound payloads. Wire types live in `@ispyai/shared`; these
// schemas are the runtime guard at every public boundary.

import { z } from "zod";

const headerMap = z.record(z.string(), z.string());

export const apiLogSchema = z.object({
  id: z.string().min(1),
  endpoint: z.string().min(1),
  method: z.string().min(1),
  requestHeaders: headerMap,
  responseHeaders: headerMap,
  statusCode: z.number().int(),
  requestBody: z.string().optional(),
  responseBody: z.string(),
  responseTime: z.number().nonnegative(),
  timestamp: z.string().min(1),
  sessionId: z.string().optional(),
  deviceName: z.string().optional(),
  appVersion: z.string().optional(),
  buildNumber: z.string().optional(),
});

export const deviceHelloSchema = z.object({
  sessionId: z.string().min(1),
  deviceName: z.string().optional(),
  appVersion: z.string().optional(),
  buildNumber: z.string().optional(),
});

export type ApiLogInput = z.infer<typeof apiLogSchema>;
export type DeviceHelloInput = z.infer<typeof deviceHelloSchema>;
