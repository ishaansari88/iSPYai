import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SessionAnalysis } from "@ispyai/shared";
import { AIAnalysisPanel } from "../components/AIAnalysisPanel";
import { useDashboardStore } from "../store/dashboardStore";

// Avoid the panel's network bootstrap during tests; the store seeded below
// is what we actually want to assert on.
vi.mock("../lib/api", () => ({
  fetchSessionAnalysis: vi.fn(() => new Promise(() => {})),
}));

function seedAnalysis(sessionId: string): SessionAnalysis {
  return {
    sessionId,
    generatedAt: "2026-01-01T00:00:00.000Z",
    source: "rule-based",
    issueSummary: "1 failed request observed.",
    possibleRootCause: "Backend regression on /orders.",
    failedAPIs: [
      {
        id: "log-1",
        endpoint: "https://api.example.com/orders",
        method: "POST",
        statusCode: 500,
        responseTime: 320,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ],
    slowAPIs: [],
    authIssues: [],
    suggestedJiraTitle: "API failure on POST /orders (HTTP 500)",
    suggestedJiraDescription: "Captured by iSpyAI...",
    severity: "medium",
    counts: { total: 5, failed: 1, slow: 0, auth: 0 },
  };
}

describe("AIAnalysisPanel", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      sessions: [],
      activeSessionId: null,
      logsBySession: {},
      analysisBySession: {},
      selectedLogId: null,
      connected: false,
      viewTab: "ai",
      viewerMode: false,
    });
  });

  it("shows an empty state when no session is active", () => {
    render(<AIAnalysisPanel />);
    expect(
      screen.getByText(/Select a session to view its AI analysis\./i)
    ).toBeInTheDocument();
  });

  it("renders the report cards when an analysis is present", () => {
    useDashboardStore.setState({
      activeSessionId: "sess-1",
      analysisBySession: { "sess-1": seedAnalysis("sess-1") },
    });
    render(<AIAnalysisPanel />);
    expect(screen.getByText("Issue Summary")).toBeInTheDocument();
    expect(screen.getByText("Possible Root Cause")).toBeInTheDocument();
    expect(screen.getByText(/Failed APIs/i)).toBeInTheDocument();
    expect(screen.getByText(/Suggested Jira ticket/i)).toBeInTheDocument();
    expect(screen.getByText(/Severity: medium/i)).toBeInTheDocument();
  });
});
