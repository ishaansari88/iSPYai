// Per-log analyzer interface + the MVP rule-based implementation.
//
// Mirrors the on-device `LogManager.analyze(log:)` so that iOS and the
// dashboard arrive at the same verdict when one or the other is offline.

import type { APILog, LogAnalysis } from "@ispyai/shared";

export interface LogAnalyzer {
  analyze(log: APILog): Promise<LogAnalysis>;
}

export const SLOW_REQUEST_MS = 1_000;

export class RuleBasedAnalyzer implements LogAnalyzer {
  async analyze(log: APILog): Promise<LogAnalysis> {
    const code = log.statusCode;

    if (code === 401) {
      return {
        category: "auth",
        severity: "error",
        source: "rule-based",
        summary:
          "Authentication issue: token expired or invalid. Verify the login or session-refresh flow.",
        suggestion: "Confirm the auth token lifecycle and refresh logic.",
      };
    }

    if (code === 403) {
      return {
        category: "authorization",
        severity: "error",
        source: "rule-based",
        summary:
          "Authorization denied: the authenticated user lacks permission for this resource.",
        suggestion: "Check role/scope configuration with the backend team.",
      };
    }

    if (code === 404) {
      return {
        category: "not-found",
        severity: "warn",
        source: "rule-based",
        summary:
          "Endpoint not found. The URL may be wrong or the resource does not exist in this environment.",
        suggestion: "Validate the URL and resource state in the test environment.",
      };
    }

    if (code >= 500 && code <= 599) {
      return {
        category: "server-error",
        severity: "error",
        source: "rule-based",
        summary: `Server error (${code}). Backend failure detected.`,
        suggestion: "File an API defect with request payload and server logs.",
      };
    }

    if (code >= 200 && code <= 299) {
      if (log.responseTime > SLOW_REQUEST_MS) {
        return {
          category: "performance",
          severity: "warn",
          source: "rule-based",
          summary: `Success but slow (${Math.round(log.responseTime)}ms).`,
          suggestion: "File a performance ticket with the latency threshold.",
        };
      }
      return {
        category: "ok",
        severity: "info",
        source: "rule-based",
        summary: `Success: API responded correctly in ${Math.round(log.responseTime)}ms.`,
      };
    }

    return {
      category: "unknown",
      severity: "warn",
      source: "rule-based",
      summary: `Status ${code}: unexpected response.`,
      suggestion: "Review the response body and compare against the API contract.",
    };
  }
}
