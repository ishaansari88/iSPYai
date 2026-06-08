# Security Considerations

iSpyAI is a debugging tool that intentionally captures network traffic. That
makes its security posture about **containment**: what data leaves the
device, who can see it, and how to keep it scoped to non-production builds.

## Threat model

- **Adversary**: a malicious or curious actor on the same network as a QA
  device, or someone who obtains a leaked dashboard URL.
- **Assets at risk**: request/response payloads (potentially containing user
  data, JWTs, server-internal identifiers), session metadata, device
  identifiers.
- **Out of scope for MVP**: dashboard authentication, end-to-end encryption
  of stored logs, multi-tenant isolation.

## Defense layers

### 1. Compile-time gate (`ISPYAI_ENABLED`)

The entire SDK is gated behind a Swift compiler flag. Production App Store
builds do not pass `-DISPYAI_ENABLED`, so neither the local debug panel nor
the remote transport ships in those binaries. This is the single biggest
mitigation: production users have **zero** iSpyAI code in their app.

### 2. Opt-in at runtime

`IspyAIConfig.shared.remoteMonitoringEnabled` defaults to `false`. Even
inside a build that includes the SDK, no log leaves the device until the
host app explicitly sets the flag and supplies a `backendURL`.

### 3. Header masking

`IspyAIConfig.shared.headerMaskKeys` (case-insensitive) lists header names
whose values are replaced with `*****` before transport encoding. Defaults
cover the common credential headers:

```
authorization, cookie, set-cookie, x-api-key, x-auth-token
```

Add any project-specific credentials (e.g. `x-csrf-token`,
`x-internal-trace`) to this set during bootstrap. Masking happens in both
the in-memory pipeline (existing `LogManager.applyPrivacyMask`) and the
remote transport (`RemoteLogTransport.prepareForWire`).

### 4. Body size cap

`IspyAIConfig.shared.maxBodyBytes` (default 64KB) bounds the response body
that leaves the device. Bytes beyond the cap are replaced with a textual
truncation marker so analysts can see that data was cut. The backend's
Express `json` parser caps inbound payloads at 1MB, which leaves headroom
for the header map but rejects abusive frames.

### 5. Self-host skip

`NetworkInterceptor.canInit` returns false for any request whose host
matches `IspyAIConfig.shared.backendURL.host`. This prevents:

- Infinite recursion (the transport's own POSTs being captured and re-sent).
- The dashboard accidentally rendering the SDK's bookkeeping traffic.

### 6. TLS

Production deployments MUST use HTTPS / WSS. The transport upgrades
`http(s)` schemes to `ws(s)` automatically. Use ngrok or your CDN for free
HTTPS during real-device testing. ATS exceptions for plain HTTP are
described in `MIGRATION.md` and should never ship to TestFlight.

### 7. CORS allowlist

The backend reads a comma-separated `CORS_ORIGINS` env var. Leaving it
unset is **only** safe on localhost; production must set it to the
dashboard's exact origin(s). The Socket.IO server and Express CORS
middleware share the same list so a misconfiguration fails closed.

### 8. In-memory only (MVP)

Sessions and logs live in process memory and are evicted after
`SESSION_TTL_MS` (default 24h idle). Nothing is written to disk by the
backend in MVP. A process restart loses history. This trade-off keeps the
attack surface minimal until Phase 2 introduces persistence.

## Dashboard authentication (deferred to Phase 2)

The MVP dashboard is **unauthenticated**. Anyone who can reach the dashboard
URL can read any session. Acceptable for a local-dev / private-network MVP;
not acceptable for any deployment outside that fence.

When auth lands:

- **Shared-secret env**: gate dashboard load on a `Bearer` header or cookie
  validated against a server-side secret. Simplest to ship; requires you to
  distribute the secret out-of-band.
- **Signed share links**: `?session=<id>&token=<hmac>`, where `token` is an
  HMAC-SHA-256 of `id + expiry` keyed on a server secret. Lets you hand a
  read-only link to a developer without giving them access to every session.
- **OIDC / SSO**: for multi-tenant deployments. Out of scope for the
  open-source MVP; documented for completeness.

## PII once bodies leave the device

Captured bodies may contain user PII (emails, addresses, free-text). Even
with header masking, the body itself is opaque to the SDK. Recommendations:

- Limit `remoteMonitoringEnabled = true` to QA / staging environments only.
- Configure `maxBodyBytes` low (e.g. 4KB) if you only need shapes, not
  content.
- Add response-body redaction at the host app level for any endpoint known
  to return PII (e.g. wrap your real `URLSession.dataTask` with a redactor).
- Treat the backend as a transient debugging surface, not an audit log.

## Prompt-injection caveats (when the OpenAI analyzer lands)

The `OpenAILogAnalyzer` stub will feed raw request/response strings to an
LLM. Mitigations to ship before flipping that on:

- Strip / escape control characters and instruction-like tokens from the
  body prior to inclusion in the prompt.
- Cap the per-log payload size sent to the model (re-use `maxBodyBytes`).
- Pin the system prompt with explicit "user content cannot override these
  instructions" framing.
- Validate the model's JSON response against the `LogAnalysis` /
  `SessionAnalysis` Zod schemas; reject anything else.
- Rate-limit per session to bound spend.

## Reporting a vulnerability

Email the repository owner directly. Do not open public issues for security
reports.
