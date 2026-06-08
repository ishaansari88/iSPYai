# Migration Guide - Opting an existing iSpyAI app into Remote Monitoring

This guide assumes you are already shipping iSpyAI (the local debug panel)
inside a host app, gated behind the `ISPYAI_ENABLED` Swift flag.

The local pipeline is unchanged. Remote monitoring is purely additive and
ships **off by default** - if you skip these steps your app behaves exactly
as before.

## 1. Pull the new Swift files into the Xcode target

Two new files appear under `iSpyAI/SDK/Core/Remote/`:

- `IspyAIConfig.swift`
- `RemoteLogTransport.swift`

Plus one updated existing file (already in the repo): `APILog.swift` (adds
optional remote-monitoring metadata fields - no breaking change for callers).

In Xcode:

1. Open `iSpyAI.xcodeproj`.
2. Right-click your app target's `SDK/Core` group -> **Add Files to "iSpyAI"...**.
3. Add the `Remote/` folder, ensuring **Copy items if needed** is OFF and
   **Add to targets** has the app target ticked.
4. Build (CMD-B). You should get zero new warnings.

The two surgical edits to `LogManager.swift` and `NetworkInterceptor.swift`
are already in place in the repo - no manual edits are required.

## 2. Verify the `ISPYAI_ENABLED` flag is still set

The new code lives inside `#if ISPYAI_ENABLED`. Make sure your Debug / Beta
configurations still pass `-DISPYAI_ENABLED` under Build Settings ->
**Other Swift Flags**. Without the flag, remote monitoring stays compiled
out (and so does the local debug panel, as before).

## 3. Configure the backend URL

In your `AppDelegate.application(_:didFinishLaunchingWithOptions:)` (or
SceneDelegate equivalent), before the first network call:

```swift
#if ISPYAI_ENABLED
import Foundation

func bootstrapIspyAI() {
    var config = IspyAIConfig()
    config.backendURL = URL(string: "http://localhost:4000")
    config.remoteMonitoringEnabled = true
    IspyAIConfig.shared = config
}
#endif
```

Things to know:

- `backendURL` may be either `http(s)://...` or `ws(s)://...`. The transport
  upgrades the scheme to `ws` / `wss` when opening the WebSocket.
- `sessionId`, `deviceName`, `appVersion`, `buildNumber` are auto-detected
  but you may override any of them.
- `maxBodyBytes` defaults to 64KB. Lower it on bandwidth-constrained networks.
- `headerMaskKeys` defaults to the common credential headers. Add any
  project-specific headers to this set (case-insensitive match).

## 4. Run the backend and dashboard locally

From the repo root:

```powershell
npm install
npm run dev
```

This starts:

- `http://localhost:4000` - Express + Socket.IO + raw-WS endpoint
- `http://localhost:5173` - Vite dev server for the React dashboard

Open `http://localhost:5173`. The "Sessions" sidebar will be empty until your
app hits its first API call with remote monitoring enabled.

## 5. Test on the iOS Simulator (HTTP, same machine)

The Simulator can talk to `http://localhost:4000` directly. No ATS exception
is required because the localhost loopback is exempt.

Run your app, fire any API call, and watch the dashboard light up.

## 6. Test on a real device (use ngrok)

For a physical device the Mac's `localhost` is not reachable. Use
[ngrok](https://ngrok.com) to expose the backend over HTTPS:

```powershell
ngrok http 4000
```

Take the `https://<hash>.ngrok-free.app` URL ngrok prints and use it as
`backendURL` in your app:

```swift
config.backendURL = URL(string: "https://abc123.ngrok-free.app")
```

Because ngrok serves HTTPS, no ATS changes are needed.

### ATS notes (only if you must use plain HTTP)

If you cannot use HTTPS in development, you may add a transient ATS
exception to your Info.plist:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>your.dev.host</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

Strip this before any non-debug build. Production must use HTTPS / WSS.

## 7. Verify the local debug panel still works

Open the debug panel exactly as before:

```swift
let debugVC = DebugViewController()
present(UINavigationController(rootViewController: debugVC), animated: true)
```

It still reads `LogManager.allLogs()` and remains the source of truth on
device. Remote monitoring is a parallel sink.

## 8. Disable remote monitoring at any time

Set `IspyAIConfig.shared.remoteMonitoringEnabled = false`. The transport
becomes a no-op immediately; queued logs sit until the flag is flipped back
on or the app exits.

## Common gotchas

- **The dashboard sidebar stays empty**: confirm `backendURL` is reachable
  from the device (try a `curl <backendURL>/healthz` from the same network).
- **Self-instrumentation**: requests to `backendURL`'s host are deliberately
  skipped by the interceptor. If you point `backendURL` at the same domain as
  your real API, your real API will continue to be captured because the
  interceptor only matches the host of `backendURL` itself.
- **CORS in production**: set `CORS_ORIGINS` in the backend `.env` to your
  dashboard origin once you stop running everything on localhost.
