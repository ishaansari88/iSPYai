# iSpyAI — iOS Network Debugger SDK

A clean, modular iOS SDK that replicates Android Chucker functionality with AI-powered debugging insights for QA testers and developers.

---

## Architecture Overview

```
iSpyAI/
├── iSpyAI.xcodeproj/               Xcode project
└── iSpyAI/
    ├── AppDelegate.swift           App entry point
    ├── SceneDelegate.swift         Window bootstrap (code-only, no storyboard)
    ├── ViewController.swift        Demo host-app screen
    ├── Info.plist
    ├── Assets.xcassets/
    └── SDK/                        ← The SDK layer
        ├── Core/
        │   ├── Models/
        │   │   └── APILog.swift            Data model for a captured request
        │   ├── NetworkInterceptor.swift    URLProtocol subclass — captures traffic
        │   ├── APIService.swift            URLSession wired with the interceptor
        │   └── LogManager.swift           Storage, privacy masking, AI analysis
        └── UI/
            ├── DebugViewController.swift   Table of captured logs
            └── LogDetailViewController.swift  Full log detail + AI insight
```

---

## How to Run

1. Open `iSpyAI.xcodeproj` in **Xcode 15+** on macOS.
2. Select an iPhone simulator or a real device (iOS 16+).
3. Press **Run** (⌘R).

> **Note:** The debug panel and network interceptor are gated behind the `ISPYAI_ENABLED` Swift compiler flag. You must add this flag to any scheme where you want the SDK active (see setup below).

---

## How It Works

### Network Capture

`NetworkInterceptor` subclasses `URLProtocol`. It is registered only inside `APIService`'s `URLSessionConfiguration`, meaning:
- Zero global side effects — third-party SDKs in the host app are untouched.
- Every call through `APIService` is automatically captured.

### Privacy Masking

Before any log reaches memory, `LogManager.applyPrivacyMask(to:)` replaces:

| Header | Stored Value |
|---|---|
| `Authorization` | `Bearer *****` |
| `x-api-key` | `*****` |
| `x-auth-token` | `*****` |
| `Cookie` / `Set-Cookie` | `*****` |

### AI Analysis

`LogManager.analyze(log:)` returns a plain-English tester insight:

| Condition | Insight |
|---|---|
| Status 401 | Authentication issue — check token/session flow |
| Status 403 | Authorization denied — check role/scope |
| Status 404 | Not found — validate URL or environment |
| Status 5xx | Server error — report API defect |
| 200 but > 1000ms | Performance bug — file latency ticket |
| 200 | Success — no action needed |

### Debug Panel

- Open via the **"Open Debug Panel"** button in the app.
- Color-coded status badges: green (2xx), orange (3xx), yellow (4xx), red (5xx).
- Swipe left on a row to delete an individual log.
- Tap any row → full detail screen with headers, pretty-printed JSON body, and AI insight.
- Share button on the detail screen generates a plain-text report.

---

## Build Configuration — Simulator, Firebase & TestFlight

The SDK uses a custom Swift compiler flag `ISPYAI_ENABLED` to control whether the debug panel and interceptor are active. This allows you to ship the same codebase to QA testers via real devices **and** keep production App Store builds completely clean.

### Setting the flag in Xcode

1. In Xcode, select your **target** → **Build Settings**
2. Search for **"Swift Compiler — Custom Flags"** → **Other Swift Flags**
3. Add `-DISPYAI_ENABLED` to the configurations where you want it active:

| Build Config | Flag | Use case |
|---|---|---|
| **Debug** | `-DISPYAI_ENABLED` | Simulator + real device during development |
| **Beta** (or a custom config) | `-DISPYAI_ENABLED` | Firebase App Distribution & TestFlight builds |
| **Release** | *(leave empty)* | App Store — debug panel is completely absent |

### Creating a "Beta" scheme for Firebase / TestFlight

1. **Product → Scheme → New Scheme** — name it `iSpyAI Beta`
2. In the scheme editor, set the **Run** and **Archive** build configuration to `Beta`
3. Add a `Beta` build configuration by duplicating `Release`:
   - Project → Info → Configurations → click `+` → Duplicate "Release" → rename to `Beta`
4. Add `-DISPYAI_ENABLED` to the **Beta** configuration's Other Swift Flags
5. Archive using the `iSpyAI Beta` scheme → upload to Firebase or TestFlight

This way:
- QA testers on **Firebase / TestFlight** get the full debug panel on their **real devices**
- **App Store** users get a clean build with zero debug code

---

## Integrating into a Host App (e.g. Practina)

```swift
// 1. Replace the host app's URLSession configuration
let config = URLSessionConfiguration.default
config.protocolClasses = [NetworkInterceptor.self] + (config.protocolClasses ?? [])
let session = URLSession(configuration: config)

// 2. Present the debug panel from any screen (debug builds only)
#if DEBUG
let debugVC = DebugViewController()
let nav = UINavigationController(rootViewController: debugVC)
present(nav, animated: true)
#endif
```

---

## Console Output Sample

```
┌────────────────────────────────────────────────────────
│  iSpyAI SDK — Captured API Log
│  ▸ Endpoint   : https://jsonplaceholder.typicode.com/posts/1
│  ▸ Method     : GET
│  ▸ Status     : 200
│  ▸ Time       : 312.47ms
│  ▸ Timestamp  : 2026-06-07 10:30:01.234
└────────────────────────────────────────────────────────

✅ iSpyAI SDK captured and analyzed API successfully
🔍 Analysis: ✅ Success: API responded correctly in 312ms. No action needed.
```

---

## Requirements

- Xcode 15+
- iOS 16.0+
- Swift 5.9+
- No third-party dependencies

---

## Remote QA Monitoring (preview)

The SDK now ships with an optional **remote** mode in addition to the local
debug panel. When enabled, captured API calls also stream live to a Node
backend and render in a React dashboard alongside an AI-assisted per-session
report (Issue Summary, Possible Root Cause, Failed / Slow APIs, Suggested
Jira ticket, Severity). The transport is opt-in (off by default), purely
additive, and the existing local pipeline is unchanged.

See [`REMOTE_MONITORING.md`](REMOTE_MONITORING.md) for a one-page quickstart
and [`docs/`](docs/) for full architecture, migration, testing, security,
and roadmap documentation.
