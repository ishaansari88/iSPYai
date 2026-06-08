import { describe, it, expect } from "vitest";
import type { LogEnvelope } from "@ispyai/shared";
import { applyFilters, DEFAULT_FILTERS } from "../store/dashboardStore";

function env(overrides: Partial<LogEnvelope["log"]> = {}): LogEnvelope {
  return {
    log: {
      id: overrides.id ?? "log-1",
      endpoint: overrides.endpoint ?? "https://api.example.com/users",
      method: overrides.method ?? "GET",
      requestHeaders: overrides.requestHeaders ?? {},
      responseHeaders: overrides.responseHeaders ?? {},
      statusCode: overrides.statusCode ?? 200,
      responseBody: overrides.responseBody ?? "{}",
      responseTime: overrides.responseTime ?? 100,
      timestamp: overrides.timestamp ?? "2026-01-01T00:00:00.000Z",
      sessionId: overrides.sessionId ?? "s1",
    },
    analysis: {
      category: "ok",
      severity: "info",
      source: "rule-based",
      summary: "ok",
    },
  };
}

describe("applyFilters", () => {
  const data: LogEnvelope[] = [
    env({ id: "1", method: "GET", statusCode: 200, responseTime: 100 }),
    env({
      id: "2",
      method: "POST",
      statusCode: 500,
      responseTime: 250,
      endpoint: "https://api.example.com/orders",
    }),
    env({
      id: "3",
      method: "GET",
      statusCode: 200,
      responseTime: 2_500,
      endpoint: "https://api.example.com/slow",
    }),
    env({
      id: "4",
      method: "GET",
      statusCode: 401,
      responseTime: 50,
      endpoint: "https://api.example.com/me",
    }),
  ];

  it("returns the full set with defaults", () => {
    const result = applyFilters(data, DEFAULT_FILTERS);
    expect(result).toHaveLength(4);
  });

  it("filters by method", () => {
    const result = applyFilters(data, { ...DEFAULT_FILTERS, method: "POST" });
    expect(result.map((e) => e.log.id)).toEqual(["2"]);
  });

  it("filters by failure status bucket", () => {
    const result = applyFilters(data, { ...DEFAULT_FILTERS, status: "fail" });
    expect(result.map((e) => e.log.id).sort()).toEqual(["2", "4"]);
  });

  it("filters by minimum latency", () => {
    const result = applyFilters(data, { ...DEFAULT_FILTERS, minLatencyMs: 1_000 });
    expect(result.map((e) => e.log.id)).toEqual(["3"]);
  });

  it("filters by endpoint substring", () => {
    const result = applyFilters(data, {
      ...DEFAULT_FILTERS,
      endpointSubstring: "orders",
    });
    expect(result.map((e) => e.log.id)).toEqual(["2"]);
  });

  it("free-text search matches URL, method, status, and body", () => {
    const result = applyFilters(data, { ...DEFAULT_FILTERS, query: "slow" });
    expect(result.map((e) => e.log.id)).toEqual(["3"]);
  });
});
