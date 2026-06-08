// SessionStore + RuleBasedAnalyzer + RuleBasedSessionAnalyzer tests.
// Run with: `npm test -w @ispyai/backend`
//
// Uses Node's built-in `node:test` runner so the backend has zero extra test
// dependencies for MVP.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SessionStore } from "../store/SessionStore.js";
import { RuleBasedAnalyzer } from "../ai/LogAnalyzer.js";
import { RuleBasedSessionAnalyzer } from "../ai/SessionAnalyzer.js";
import type { APILog, LogEnvelope } from "@ispyai/shared";

function makeLog(overrides: Partial<APILog> = {}): APILog {
  return {
    id: overrides.id ?? "log-1",
    endpoint: overrides.endpoint ?? "https://api.example.com/users",
    method: overrides.method ?? "GET",
    requestHeaders: overrides.requestHeaders ?? {},
    responseHeaders: overrides.responseHeaders ?? {},
    statusCode: overrides.statusCode ?? 200,
    responseBody: overrides.responseBody ?? "{}",
    responseTime: overrides.responseTime ?? 120,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00.000Z",
    sessionId: overrides.sessionId ?? "sess-A",
    deviceName: overrides.deviceName,
    appVersion: overrides.appVersion,
    buildNumber: overrides.buildNumber,
  };
}

async function envelope(
  analyzer: RuleBasedAnalyzer,
  overrides: Partial<APILog> = {}
): Promise<LogEnvelope> {
  const log = makeLog(overrides);
  const analysis = await analyzer.analyze(log);
  return { log, analysis };
}

describe("SessionStore", () => {
  it("creates a session from hello and surfaces it via listSessions()", () => {
    const store = new SessionStore({ sweepIntervalMs: 0 });
    try {
      const session = store.upsertFromHello({
        sessionId: "sess-A",
        deviceName: "iPhone 15",
        appVersion: "1.2.3",
        buildNumber: "42",
      });
      assert.equal(session.id, "sess-A");
      assert.equal(session.deviceName, "iPhone 15");
      assert.equal(session.buildNumber, "42");

      const all = store.listSessions();
      assert.equal(all.length, 1);
      assert.equal(all[0]!.id, "sess-A");
    } finally {
      store.shutdown();
    }
  });

  it("auto-creates a session when a log arrives without prior hello", async () => {
    const store = new SessionStore({ sweepIntervalMs: 0 });
    const analyzer = new RuleBasedAnalyzer();
    try {
      const env = await envelope(analyzer, { sessionId: "sess-B" });
      store.recordLog(env);
      assert.equal(store.hasSession("sess-B"), true);
      assert.equal(store.listSessions()[0]!.logCount, 1);
    } finally {
      store.shutdown();
    }
  });

  it("enforces the recent-log cap by dropping oldest entries", async () => {
    const store = new SessionStore({ sweepIntervalMs: 0, recentLogCap: 3 });
    const analyzer = new RuleBasedAnalyzer();
    try {
      for (let i = 0; i < 5; i += 1) {
        store.recordLog(await envelope(analyzer, { id: `log-${i}`, sessionId: "sess-C" }));
      }
      const logs = store.getRecentLogs("sess-C");
      assert.equal(logs.length, 3);
      assert.deepEqual(
        logs.map((e) => e.log.id),
        ["log-2", "log-3", "log-4"]
      );
    } finally {
      store.shutdown();
    }
  });

  it("evicts sessions whose lastSeenAt is older than ttl", async () => {
    let frozen = new Date("2026-01-01T00:00:00.000Z");
    const store = new SessionStore({
      sweepIntervalMs: 0,
      sessionTtlMs: 60_000,
      now: () => frozen,
    });
    try {
      store.upsertFromHello({ sessionId: "old" });
      frozen = new Date("2026-01-01T01:00:00.000Z");
      const evicted = store.sweepExpired(frozen);
      assert.equal(evicted, 1);
      assert.equal(store.hasSession("old"), false);
    } finally {
      store.shutdown();
    }
  });
});

describe("RuleBasedAnalyzer", () => {
  const analyzer = new RuleBasedAnalyzer();

  it("classifies 401 as an auth error", async () => {
    const a = await analyzer.analyze(makeLog({ statusCode: 401 }));
    assert.equal(a.category, "auth");
    assert.equal(a.severity, "error");
  });

  it("flags fast 2xx as ok", async () => {
    const a = await analyzer.analyze(makeLog({ statusCode: 200, responseTime: 50 }));
    assert.equal(a.category, "ok");
    assert.equal(a.severity, "info");
  });

  it("flags slow 2xx as performance warning", async () => {
    const a = await analyzer.analyze(
      makeLog({ statusCode: 200, responseTime: 2_500 })
    );
    assert.equal(a.category, "performance");
    assert.equal(a.severity, "warn");
  });

  it("classifies 5xx as server error", async () => {
    const a = await analyzer.analyze(makeLog({ statusCode: 503 }));
    assert.equal(a.category, "server-error");
    assert.equal(a.severity, "error");
  });
});

describe("RuleBasedSessionAnalyzer", () => {
  const logAnalyzer = new RuleBasedAnalyzer();
  const sessionAnalyzer = new RuleBasedSessionAnalyzer();

  it("returns an empty-state report when there are no logs", async () => {
    const report = await sessionAnalyzer.analyze({
      sessionId: "sess-empty",
      envelopes: [],
    });
    assert.equal(report.severity, "low");
    assert.equal(report.counts.total, 0);
    assert.equal(report.failedAPIs.length, 0);
    assert.match(report.issueSummary, /No API activity/i);
  });

  it("escalates severity to high when an auth failure is present", async () => {
    const envelopes = [
      await envelope(logAnalyzer, { id: "ok-1", statusCode: 200 }),
      await envelope(logAnalyzer, {
        id: "auth-1",
        statusCode: 401,
        endpoint: "https://api.example.com/me",
      }),
    ];
    const report = await sessionAnalyzer.analyze({
      sessionId: "sess-X",
      envelopes,
    });
    assert.equal(report.severity, "high");
    assert.equal(report.counts.auth, 1);
    assert.equal(report.counts.failed, 1);
    assert.match(report.suggestedJiraTitle, /auth/i);
  });

  it("buckets slow 2xx requests under slowAPIs", async () => {
    const envelopes = [
      await envelope(logAnalyzer, {
        id: "slow-1",
        statusCode: 200,
        responseTime: 4_000,
      }),
    ];
    const report = await sessionAnalyzer.analyze({
      sessionId: "sess-Y",
      envelopes,
    });
    assert.equal(report.counts.slow, 1);
    assert.equal(report.slowAPIs.length, 1);
  });
});
