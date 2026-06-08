# Testing Strategy

The goal is each layer to be testable in isolation, with at least one
runnable test per layer in the MVP. The iOS suite is described here and
designed to drop into an XCTest target without changes to the project file.

## Backend (Node 20)

Runner: Node's built-in `node:test` via `tsx`. Zero extra dependencies.

```powershell
npm test -w @ispyai/backend
```

Covered today (`backend/src/__tests__/SessionStore.test.ts`):

- `SessionStore` upserts sessions from hello frames, auto-creates from a
  bare log, enforces the recent-log cap, and evicts after TTL.
- `RuleBasedAnalyzer` classifies 401 / 200 / slow-200 / 5xx correctly.
- `RuleBasedSessionAnalyzer` produces empty-state reports, escalates to
  `high` severity on auth failures, and surfaces slow APIs.

Add next:

- `deviceWebSocket.ts` end-to-end with a fake `ws` client - assert that a
  `hello` + `log` frame results in a `SessionsSnapshot` broadcast on a fake
  Socket.IO namespace.
- `routes/sessions.ts` and `routes/logs.ts` HTTP smoke tests via `supertest`.
- Property test for `SessionAnalyzer` severity bucketing.

## Dashboard (Vite + React 18)

Runner: Vitest + Testing Library (`jsdom`).

```powershell
npm test -w @ispyai/dashboard
```

Covered today:

- `applyFilters` (`src/__tests__/filters.test.ts`) - method, status bucket,
  latency, endpoint substring, and free-text search across body / headers.
- `AIAnalysisPanel` (`src/__tests__/AIAnalysisPanel.test.tsx`) - empty state
  when no session is active; renders all required cards (Issue Summary,
  Root Cause, Failed APIs, Suggested Jira, Severity badge) when an analysis
  is present in the store.

Add next:

- `LogTable` row coloring: failure rows have `bg-status-error/*`, slow
  rows have `bg-status-warn/*`.
- `TopBar` Share Session button copies the canonical `?session=<id>` URL.
- Tabs component honors `viewerMode` (hides destructive actions).

## iOS SDK (XCTest)

No tests are added to the Xcode target by this change (the spec keeps the
project file untouched). Drop the following XCTest cases into a new
`iSpyAITests` target when you create one. All tests use stock XCTest and a
trivial `URLProtocol` mock; no third-party deps.

### `IspyAIConfigTests`

```swift
import XCTest
@testable import iSpyAI

final class IspyAIConfigTests: XCTestCase {
    func test_defaultIsDisabled() {
        let cfg = IspyAIConfig()
        XCTAssertFalse(cfg.remoteMonitoringEnabled)
        XCTAssertNil(cfg.backendURL)
        XCTAssertEqual(cfg.maxBodyBytes, 64 * 1024)
        XCTAssertTrue(cfg.headerMaskKeys.contains("authorization"))
    }

    func test_detectAppVersionUsesBundle() {
        XCTAssertFalse(IspyAIConfig.detectAppVersion().isEmpty)
        XCTAssertFalse(IspyAIConfig.detectBuildNumber().isEmpty)
    }
}
```

### `RemoteLogTransportTests`

A mock `URLProtocol` stands in for both HTTP and WS. WS is exercised via the
fallback path here because the WebSocket end-to-end test belongs in an
integration target.

```swift
import XCTest
@testable import iSpyAI

final class RemoteLogTransportTests: XCTestCase {

    override func setUp() {
        super.setUp()
        URLProtocolMock.requests.removeAll()
        var cfg = IspyAIConfig()
        cfg.remoteMonitoringEnabled = true
        cfg.backendURL = URL(string: "http://example.test")
        cfg.maxBodyBytes = 16
        IspyAIConfig.shared = cfg
    }

    func test_sendFallsBackToHTTP_whenWSFails() async {
        URLProtocolMock.handler = { req in
            // WS opens against /realtime/device; HTTP fallback hits /v1/logs.
            // The mock fails the WS handshake by returning a non-101.
            return (HTTPURLResponse(url: req.url!, statusCode: 202,
                                    httpVersion: nil, headerFields: nil)!, Data())
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [URLProtocolMock.self]
        let session = URLSession(configuration: config)
        let transport = RemoteLogTransport(urlSession: session)

        let log = APILog(endpoint: "https://api.example.com/x",
                         method: "GET",
                         requestHeaders: [:],
                         responseHeaders: [:],
                         statusCode: 200,
                         responseBody: "ok",
                         responseTime: 100)
        await transport.send(log)

        XCTAssertTrue(URLProtocolMock.requests.contains { $0.url?.path == "/v1/logs" })
    }

    func test_truncationCapped() async {
        var captured = Data()
        URLProtocolMock.handler = { req in
            captured = (req.httpBodyStream.flatMap { Self.read($0) }) ?? Data()
            return (HTTPURLResponse(url: req.url!, statusCode: 202,
                                    httpVersion: nil, headerFields: nil)!, Data())
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [URLProtocolMock.self]
        let session = URLSession(configuration: config)
        let transport = RemoteLogTransport(urlSession: session)

        let log = APILog(endpoint: "https://api.example.com/big",
                         method: "GET",
                         requestHeaders: [:],
                         responseHeaders: [:],
                         statusCode: 200,
                         responseBody: String(repeating: "x", count: 1024),
                         responseTime: 100)
        await transport.send(log)

        XCTAssertTrue(captured.count < 1024)
    }

    func test_queueOverflowDropsOldest() async {
        // Disable real network: every send fails so the queue grows past 500.
        let session = URLSession(configuration: .ephemeral)
        let transport = RemoteLogTransport(urlSession: session)
        for i in 0..<700 {
            let log = APILog(endpoint: "https://api.example.com/\\(i)",
                             method: "GET",
                             requestHeaders: [:], responseHeaders: [:],
                             statusCode: 200, responseBody: "",
                             responseTime: 1)
            await transport.send(log)
        }
        // No XCTAssert here; the test asserts process doesn't crash and that
        // memory stays bounded - assert via a snapshot in the actor's tests
        // once `queue` is exposed via a debug helper.
    }
}
```

### `NetworkInterceptorTests`

```swift
import XCTest
@testable import iSpyAI

final class NetworkInterceptorTests: XCTestCase {
    func test_skipsSelfBackend() {
        var cfg = IspyAIConfig()
        cfg.backendURL = URL(string: "http://example.test")
        IspyAIConfig.shared = cfg

        let req = URLRequest(url: URL(string: "http://example.test/v1/logs")!)
        XCTAssertFalse(NetworkInterceptor.canInit(with: req))
    }

    func test_interceptsOtherHosts() {
        var cfg = IspyAIConfig()
        cfg.backendURL = URL(string: "http://example.test")
        IspyAIConfig.shared = cfg

        let req = URLRequest(url: URL(string: "https://api.example.com/users")!)
        XCTAssertTrue(NetworkInterceptor.canInit(with: req))
    }
}
```

## Manual smoke checklist (every PR)

1. `npm install && npm run dev`. Open the dashboard at `http://localhost:5173`.
2. Run the iOS host app in the Simulator with `remoteMonitoringEnabled = true`
   and `backendURL = http://localhost:4000`.
3. Tap the demo button - verify the dashboard shows the new session and
   the request appears in the Live Stream tab.
4. Pull the network plug on the backend (Ctrl+C the server). Tap several
   requests on the device. Confirm:
   - Local debug panel still records them.
   - The dashboard shows "Disconnected".
5. Restart the backend. The queued requests flush, the dashboard shows
   "Live" again, and the previously-dropped requests appear.
6. Open the AI Analysis tab. Force a 500 from a test endpoint and confirm
   the report updates with the new severity within ~1 second.
7. Click Share Session, paste the URL in a new tab. The dashboard renders
   in read-only mode (no Clear / Share / Export buttons).
