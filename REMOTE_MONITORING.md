# iSpyAI - Remote QA Monitoring (Preview)

Local debugging in the iOS host app continues to work exactly as before.
This document covers the new **remote** mode: live-streaming captured API
calls from a device to a web dashboard with an AI-assisted per-session
report.

## What you get

- **Connected Devices** sidebar listing every active session.
- **Live API Stream**: virtualised table that paints in real time, color-
  coded for failures (red) and slow requests (amber, >1s).
- **Failed Requests** tab: same table, pre-filtered to failures.
- **Session Explorer**: dense searchable view with structural filters
  (method, status, latency, endpoint substring).
- **AI Analysis** tab: per-session report with Issue Summary, Possible
  Root Cause, Failed / Slow / Auth APIs, Suggested Jira Title and
  Description (with copy buttons), and a Severity badge.
- **Detail panel**: full headers, pretty-printed JSON body, Copy as cURL.
- **Share Session**: copies a `?session=<id>` URL that opens the dashboard
  in a read-only viewer.
- **Export JSON**: downloads the full session as JSON.

The transport is opt-in (`remoteMonitoringEnabled = false` by default),
header masking and body truncation are mandatory before anything leaves the
device, and the existing local pipeline is untouched.

## Quickstart (local dev)

Prerequisites: Node 20+, npm 10+ (ships with Node 20), Xcode 15+.

```powershell
# From the repo root
npm install
npm run dev
```

That starts:

- `http://localhost:4000` - Express + Socket.IO + raw-WS device endpoint
- `http://localhost:5173` - React dashboard (Vite dev server)

Open the dashboard at `http://localhost:5173`. The sidebar stays empty
until a device connects.

In the iOS host app, before any network call:

```swift
#if ISPYAI_ENABLED
import Foundation

var cfg = IspyAIConfig()
cfg.backendURL = URL(string: "http://localhost:4000")
cfg.remoteMonitoringEnabled = true
IspyAIConfig.shared = cfg
#endif
```

Run the app in the Simulator. Tap any button that triggers an API call -
you should see the request appear on the dashboard within ~50ms.

## Real-device testing (ngrok)

```powershell
ngrok http 4000
```

Use the printed `https://` URL as `backendURL`. No ATS changes are needed.

## Where to read more

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - components, data flow,
  sequence diagram, AI plug points.
- [`docs/MIGRATION.md`](docs/MIGRATION.md) - step-by-step opt-in for an
  existing iSpyAI integration.
- [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) - what's tested
  and how to add more, including the iOS XCTest cases to drop into a new
  test target.
- [`docs/SECURITY.md`](docs/SECURITY.md) - threat model, header masking,
  body cap, TLS, CORS, opt-in posture, prompt-injection caveats.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) - phased plan beyond MVP.

## Repo layout (added in this PR)

```
backend/         Node 20 + TypeScript + Express + Socket.IO + raw WS
dashboard/       React 18 + Vite + Tailwind + Zustand
shared/          Workspace package with canonical TypeScript types
docs/            Architecture, migration, testing, security, roadmap
iSpyAI/SDK/Core/Remote/
    IspyAIConfig.swift        Public config struct, off by default
    RemoteLogTransport.swift  Swift actor (WS + HTTP fallback)
```

The two existing Swift files (`LogManager.swift`, `NetworkInterceptor.swift`)
got a single additive hook each, both inside `#if ISPYAI_ENABLED`.
