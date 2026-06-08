// Socket.IO event names and payload shapes. Importing the union below from
// the backend or dashboard guarantees both ends agree on the same contract.

import type { APILog, LogEnvelope, Session, SessionAnalysis } from "./types";

export const REALTIME_NAMESPACE = "/realtime" as const;

export const WSEvents = {
  /** Device -> server: announces a new session before any logs flow. */
  DeviceHello: "device:hello",
  /** Device -> server: pushes a captured log over the persistent socket. */
  DeviceLog: "device:log",
  /** Server -> dashboard: a freshly analyzed log is ready for display. */
  LogNew: "log:new",
  /** Server -> dashboard: full session list snapshot (sent on connect). */
  SessionsSnapshot: "sessions:snapshot",
  /** Dashboard -> server: subscribe to a specific session's stream. */
  SessionJoined: "session:joined",
  /** Dashboard -> server: leave a previously joined session room. */
  SessionLeft: "session:left",
  /** Server -> dashboard: per-session AI report has been (re)computed. */
  AnalysisUpdated: "analysis:updated",
} as const;

export type WSEventName = (typeof WSEvents)[keyof typeof WSEvents];

// MARK: - Payloads

export interface DeviceHelloPayload {
  sessionId: string;
  deviceName?: string;
  appVersion?: string;
  buildNumber?: string;
}

export interface DeviceLogPayload {
  log: APILog;
}

export type LogNewPayload = LogEnvelope;

export interface SessionsSnapshotPayload {
  sessions: Session[];
}

export interface SessionRoomPayload {
  sessionId: string;
}

export interface AnalysisUpdatedPayload {
  analysis: SessionAnalysis;
}
