// Core data contracts shared between the iOS SDK, backend, and dashboard.
// The wire format mirrors the Swift `APILog` so the SDK can encode logs
// without an additional translation layer.

export interface APILog {
  id: string;
  endpoint: string;
  method: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  statusCode: number;
  /** Captured request body when available (UTF-8). May be truncated by the SDK. */
  requestBody?: string;
  /** Captured response body (UTF-8). Truncated to the SDK's configured cap. */
  responseBody: string;
  /** Round-trip duration in milliseconds. */
  responseTime: number;
  /** ISO-8601 timestamp from the device clock. */
  timestamp: string;

  // Remote-monitoring metadata stamped by the SDK before delivery.
  sessionId?: string;
  deviceName?: string;
  appVersion?: string;
  buildNumber?: string;
}

/**
 * LogAnalysis is the per-log heuristic enrichment surfaced alongside each log.
 * `RuleBasedAnalyzer` produces this on the server today; an `OpenAIAnalyzer`
 * would emit the same shape so dashboards stay schema-stable.
 */
export interface LogAnalysis {
  /** Stable category for filtering (e.g. "auth", "server-error", "perf", "ok"). */
  category:
    | "auth"
    | "authorization"
    | "not-found"
    | "server-error"
    | "performance"
    | "ok"
    | "unknown";
  /** Plain-English insight intended for QA testers. */
  summary: string;
  /** Severity bucket used by the dashboard for color coding. */
  severity: "info" | "warn" | "error";
  /** Free-form actionable suggestion (optional). */
  suggestion?: string;
  /** Source identifier for the analyzer that produced this insight. */
  source: "rule-based" | "openai";
}

/** Session represents a single device + run pairing seen by the platform. */
export interface Session {
  id: string;
  deviceName?: string;
  appVersion?: string;
  buildNumber?: string;
  /** ISO-8601 timestamp when the device first announced itself. */
  startedAt: string;
  /** ISO-8601 timestamp of the most recent activity (log or hello). */
  lastSeenAt: string;
  /** Cumulative count of logs received for this session. */
  logCount: number;
}

/** Wire envelope broadcast to dashboards for every captured log. */
export interface LogEnvelope {
  log: APILog;
  analysis: LogAnalysis;
}

/** Compact reference to a single log used inside session-level analyses. */
export interface AnalysisLogRef {
  id: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: string;
}

export type SessionSeverity = "low" | "medium" | "high";

/**
 * SessionAnalysis is the per-session AI/heuristic report rendered in the
 * dashboard's "AI Analysis" tab. The shape is intentionally stable so the
 * future OpenAI-backed analyzer can emit the same payload.
 */
export interface SessionAnalysis {
  sessionId: string;
  /** ISO-8601 timestamp when this report was produced. */
  generatedAt: string;
  /** Source identifier for the analyzer that produced this report. */
  source: "rule-based" | "openai";

  issueSummary: string;
  possibleRootCause: string;

  failedAPIs: AnalysisLogRef[];
  slowAPIs: AnalysisLogRef[];
  authIssues: AnalysisLogRef[];

  suggestedJiraTitle: string;
  suggestedJiraDescription: string;

  severity: SessionSeverity;

  counts: {
    total: number;
    failed: number;
    slow: number;
    auth: number;
  };
}
