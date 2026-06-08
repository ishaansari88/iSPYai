# Roadmap

A phased plan from the MVP shipped in this PR through to a production-grade
QA platform. Phases are deliberately additive: each builds on the prior
without breaking what came before.

## Phase 1 - MVP (this PR)

- Dual-mode SDK: existing local debug + opt-in remote transport.
- iOS `RemoteLogTransport` actor: WS first, HTTP fallback, queue, backoff,
  body truncation, header masking, self-host skip.
- Node 20 / TypeScript / Express / Socket.IO backend with:
  - Raw-WS device endpoint (`/realtime/device`)
  - Socket.IO dashboard namespace (`/realtime`)
  - In-memory `SessionStore` with 24h idle TTL
  - Per-log `RuleBasedAnalyzer`
  - Per-session `RuleBasedSessionAnalyzer` (debounced 1s)
- React 18 dashboard: Sessions sidebar, Live Stream, Failed Requests,
  Session Explorer, AI Analysis tab with Suggested Jira card, Share Session
  (`?session=<id>` read-only mode), Export JSON, Copy as cURL.
- Documentation: Architecture, Migration, Testing, Security, Roadmap.
- At least one runnable test per layer (Node test runner + Vitest).

## Phase 2 - Production hardening (next 4-6 weeks)

- **Real OpenAI analyzer**
  - Wire `OpenAILogAnalyzer` + `OpenAISessionAnalyzer` behind
    `LOG_ANALYZER=openai` env.
  - PII redaction pass (emails, phone numbers, JWTs) before any prompt.
  - Response Zod validation; fall back to rule-based on parse failure.
  - Per-session token budget + per-request caching keyed on
    `(endpoint, status, body-hash)`.
- **Persistence**
  - SQLite via `better-sqlite3` for sessions + logs + analyses. Same
    `SessionStore` surface, new implementation behind an interface.
  - Retention policy: 30 days default, configurable per session.
- **Dashboard auth**
  - Shared-secret bearer for everything except `?session=<id>` share links.
  - Signed share links (HMAC-SHA-256 with expiry) for one-off external
    sharing.
- **iOS test target**
  - Create `iSpyAITests` Xcode target; land the suites described in
    `docs/TESTING_STRATEGY.md`.
- **Backend test depth**
  - Add `supertest` for HTTP routes and a fake `ws` client for the device
    endpoint.
  - Property tests for `SessionAnalyzer` severity bucketing.
- **Dashboard polish**
  - Re-sizable detail pane with persisted width.
  - Multi-select sessions and side-by-side log compare.
  - Saved filter presets (e.g. "auth failures only") in localStorage.

## Phase 3 - Intelligence (Q3)

- **Duplicate bug detection**: hash + cluster similar failures across
  sessions; the AI panel surfaces "Seen 14 times today across 3 builds".
- **Regression detection between builds**: diff session-level analyses
  across `buildNumber` boundaries; flag endpoints that started failing or
  slowed down in build N.
- **Root-cause analysis across multiple APIs**: dependency graph inference
  (correlate timing + headers like `x-trace-id`) so the analyzer can say
  "auth/login slow -> /me 5xx" instead of treating them independently.
- **Release health reports**: scheduled rollup (daily, per build) emailed
  or posted to Slack with the top recurring issues, regression flags, and
  links back to the dashboard.

## Phase 4 - Workflow integration (Q4)

- **CI integration**: a CLI runner that boots the backend in-process,
  drives an XCUITest scenario, captures the resulting session report,
  and fails the build if severity is `high`.
- **Jira / Linear deep links**: one-click "Create ticket" from the AI
  Analysis panel, prefilled with the suggested title + description +
  attached session export.
- **Replay**: optional capture of the full request body (not just the
  truncated snippet) so a developer can replay a captured call against
  any environment from inside the dashboard.
- **Multi-platform SDK**: Android (OkHttp interceptor) and React Native
  (xhook) clients speaking the same JSON wire format. The backend and
  dashboard stay unchanged.

## Non-goals (explicitly deferred)

- Real-time mirroring of user UI (screen recording). Network only.
- General-purpose APM. iSpyAI is for QA + debugging, not production
  performance monitoring; keep the scope narrow.
- Encrypted-at-rest storage. Once persistence lands, rely on OS-level
  disk encryption + transport TLS rather than rolling our own.
