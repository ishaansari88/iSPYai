// Per-session analyzer. Aggregates the LogEnvelopes already produced by a
// per-log LogAnalyzer into the structured report rendered by the dashboard's
// "AI Analysis" tab.
//
// The shape is stable across implementations: when an OpenAI-backed variant
// lands in Phase 2 it must emit the same `SessionAnalysis` so the frontend
// renders without conditional logic.

import type {
  AnalysisLogRef,
  LogEnvelope,
  SessionAnalysis,
  SessionSeverity,
} from "@ispyai/shared";
import { SLOW_REQUEST_MS } from "./LogAnalyzer.js";

export interface SessionAnalyzer {
  analyze(input: {
    sessionId: string;
    envelopes: LogEnvelope[];
  }): Promise<SessionAnalysis>;
}

export class RuleBasedSessionAnalyzer implements SessionAnalyzer {
  async analyze(input: {
    sessionId: string;
    envelopes: LogEnvelope[];
  }): Promise<SessionAnalysis> {
    const { sessionId, envelopes } = input;

    const failed: AnalysisLogRef[] = [];
    const slow: AnalysisLogRef[] = [];
    const auth: AnalysisLogRef[] = [];

    for (const env of envelopes) {
      const { log } = env;
      const ref: AnalysisLogRef = {
        id: log.id,
        endpoint: log.endpoint,
        method: log.method,
        statusCode: log.statusCode,
        responseTime: log.responseTime,
        timestamp: log.timestamp,
      };

      if (log.statusCode === 401 || log.statusCode === 403) auth.push(ref);
      if (log.statusCode >= 400 || log.statusCode === 0) failed.push(ref);
      if (log.statusCode < 400 && log.responseTime > SLOW_REQUEST_MS) {
        slow.push(ref);
      }
    }

    const total = envelopes.length;
    const severity = pickSeverity({
      failed: failed.length,
      auth: auth.length,
      total,
    });

    const issueSummary = buildIssueSummary({
      total,
      failed: failed.length,
      slow: slow.length,
      auth: auth.length,
    });

    const possibleRootCause = buildRootCause({
      failed,
      slow,
      auth,
    });

    const suggestedJiraTitle = buildJiraTitle({
      failed,
      slow,
      auth,
    });

    const suggestedJiraDescription = buildJiraDescription({
      sessionId,
      total,
      failed,
      slow,
      auth,
    });

    return {
      sessionId,
      generatedAt: new Date().toISOString(),
      source: "rule-based",
      issueSummary,
      possibleRootCause,
      failedAPIs: failed.slice(-25).reverse(),
      slowAPIs: slow.slice(-25).reverse(),
      authIssues: auth.slice(-25).reverse(),
      suggestedJiraTitle,
      suggestedJiraDescription,
      severity,
      counts: {
        total,
        failed: failed.length,
        slow: slow.length,
        auth: auth.length,
      },
    };
  }
}

function pickSeverity(counts: {
  failed: number;
  auth: number;
  total: number;
}): SessionSeverity {
  if (counts.auth > 0) return "high";
  if (counts.failed === 0) return "low";
  const failureRate = counts.total === 0 ? 0 : counts.failed / counts.total;
  if (failureRate >= 0.25 || counts.failed >= 5) return "high";
  if (failureRate >= 0.1 || counts.failed >= 2) return "medium";
  return "low";
}

function buildIssueSummary(counts: {
  total: number;
  failed: number;
  slow: number;
  auth: number;
}): string {
  if (counts.total === 0) return "No API activity captured yet for this session.";
  const parts: string[] = [];
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.slow > 0) parts.push(`${counts.slow} slow`);
  if (counts.auth > 0) parts.push(`${counts.auth} auth-related`);
  if (parts.length === 0) {
    return `Session is healthy across ${counts.total} captured request${
      counts.total === 1 ? "" : "s"
    }.`;
  }
  return `Detected ${parts.join(", ")} request${
    parts.length === 1 ? "" : "s"
  } out of ${counts.total} captured.`;
}

function buildRootCause(input: {
  failed: AnalysisLogRef[];
  slow: AnalysisLogRef[];
  auth: AnalysisLogRef[];
}): string {
  if (input.auth.length > 0) {
    const sample = input.auth[0]!;
    return `Authentication failures on ${sample.method} ${pathOf(
      sample.endpoint
    )} (status ${sample.statusCode}) suggest an invalid or expired token, or a misconfigured auth scope.`;
  }
  const serverErrors = input.failed.filter((r) => r.statusCode >= 500);
  if (serverErrors.length > 0) {
    const sample = serverErrors[0]!;
    return `Server-side failure surfaced on ${sample.method} ${pathOf(
      sample.endpoint
    )} (status ${sample.statusCode}). Likely backend regression or downstream dependency outage.`;
  }
  const clientErrors = input.failed.filter(
    (r) => r.statusCode >= 400 && r.statusCode < 500
  );
  if (clientErrors.length > 0) {
    const sample = clientErrors[0]!;
    return `Client error on ${sample.method} ${pathOf(
      sample.endpoint
    )} (status ${sample.statusCode}). Likely contract drift between the app and backend.`;
  }
  if (input.slow.length > 0) {
    const sample = input.slow[0]!;
    return `Performance regression: ${sample.method} ${pathOf(
      sample.endpoint
    )} took ${Math.round(sample.responseTime)}ms.`;
  }
  return "No anomalies detected in the current sample.";
}

function buildJiraTitle(input: {
  failed: AnalysisLogRef[];
  slow: AnalysisLogRef[];
  auth: AnalysisLogRef[];
}): string {
  if (input.auth.length > 0) {
    const sample = input.auth[0]!;
    return `Auth failure on ${sample.method} ${pathOf(sample.endpoint)} (HTTP ${sample.statusCode})`;
  }
  if (input.failed.length > 0) {
    const sample = input.failed[0]!;
    return `API failure on ${sample.method} ${pathOf(sample.endpoint)} (HTTP ${sample.statusCode})`;
  }
  if (input.slow.length > 0) {
    const sample = input.slow[0]!;
    return `Slow API: ${sample.method} ${pathOf(sample.endpoint)} (${Math.round(
      sample.responseTime
    )}ms)`;
  }
  return "No actionable issue detected in this session";
}

function buildJiraDescription(input: {
  sessionId: string;
  total: number;
  failed: AnalysisLogRef[];
  slow: AnalysisLogRef[];
  auth: AnalysisLogRef[];
}): string {
  const lines: string[] = [];
  lines.push("Captured by iSpyAI remote monitoring.");
  lines.push("");
  lines.push(`Session: ${input.sessionId}`);
  lines.push(`Total requests captured: ${input.total}`);
  lines.push(`Failed: ${input.failed.length}`);
  lines.push(`Slow (>${SLOW_REQUEST_MS}ms): ${input.slow.length}`);
  lines.push(`Auth-related: ${input.auth.length}`);

  if (input.failed.length > 0) {
    lines.push("");
    lines.push("Failed APIs:");
    for (const r of input.failed.slice(-10)) {
      lines.push(
        `- ${r.method} ${r.endpoint} -> ${r.statusCode} in ${Math.round(
          r.responseTime
        )}ms at ${r.timestamp}`
      );
    }
  }

  if (input.slow.length > 0) {
    lines.push("");
    lines.push("Slow APIs:");
    for (const r of input.slow.slice(-10)) {
      lines.push(
        `- ${r.method} ${r.endpoint} took ${Math.round(r.responseTime)}ms at ${r.timestamp}`
      );
    }
  }

  return lines.join("\n");
}

function pathOf(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.pathname || endpoint;
  } catch {
    return endpoint;
  }
}
