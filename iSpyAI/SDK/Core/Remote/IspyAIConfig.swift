#if ISPYAI_ENABLED
import Foundation
#if canImport(UIKit)
import UIKit
#endif

// MARK: - IspyAIConfig
// Single configuration value object the SDK reads at runtime. Host apps
// override `IspyAIConfig.shared` before any captured call (typically in
// `application(_:didFinishLaunchingWithOptions:)`) to point at a backend or
// to enable remote monitoring.
//
// Remote monitoring is OFF by default so existing iSpyAI integrations behave
// identically until they explicitly opt in.

public struct IspyAIConfig {

    /// Process-wide mutable shared instance. Read by the LogManager hook and
    /// the RemoteLogTransport on every send.
    public static var shared = IspyAIConfig()

    /// Master switch for the remote transport. When `false`, the SDK only
    /// stores logs locally and `RemoteLogTransport` is never invoked.
    public var remoteMonitoringEnabled: Bool = false

    /// Base URL of the iSpyAI backend. May be either `http(s)://host:port` or
    /// `ws(s)://host:port`; the transport derives the WebSocket URL from it.
    /// When `nil`, the transport is a no-op.
    public var backendURL: URL? = nil

    /// Stable per-app-launch session identifier. Stamped on every outgoing log.
    public var sessionId: String

    /// Human-readable device name surfaced in the dashboard.
    public var deviceName: String

    /// Host app marketing version (CFBundleShortVersionString).
    public var appVersion: String

    /// Host app build number (CFBundleVersion).
    public var buildNumber: String

    /// Hard cap on captured body sizes (request + response) before they are
    /// truncated for transport. Defaults to 64KB.
    public var maxBodyBytes: Int = 64 * 1_024

    /// Header keys whose values must be replaced with a redaction marker
    /// before leaving the device. Match is case-insensitive.
    public var headerMaskKeys: Set<String> = [
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-auth-token"
    ]

    public init(
        remoteMonitoringEnabled: Bool = false,
        backendURL: URL? = nil,
        sessionId: String = UUID().uuidString,
        deviceName: String = IspyAIConfig.detectDeviceName(),
        appVersion: String = IspyAIConfig.detectAppVersion(),
        buildNumber: String = IspyAIConfig.detectBuildNumber(),
        maxBodyBytes: Int = 64 * 1_024,
        headerMaskKeys: Set<String> = [
            "authorization",
            "cookie",
            "set-cookie",
            "x-api-key",
            "x-auth-token"
        ]
    ) {
        self.remoteMonitoringEnabled = remoteMonitoringEnabled
        self.backendURL = backendURL
        self.sessionId = sessionId
        self.deviceName = deviceName
        self.appVersion = appVersion
        self.buildNumber = buildNumber
        self.maxBodyBytes = maxBodyBytes
        self.headerMaskKeys = headerMaskKeys
    }

    // MARK: - Detection helpers

    public static func detectDeviceName() -> String {
        #if canImport(UIKit)
        return UIDevice.current.name
        #else
        return "Unknown device"
        #endif
    }

    public static func detectAppVersion() -> String {
        let info = Bundle.main.infoDictionary
        return (info?["CFBundleShortVersionString"] as? String) ?? "0.0.0"
    }

    public static func detectBuildNumber() -> String {
        let info = Bundle.main.infoDictionary
        return (info?["CFBundleVersion"] as? String) ?? "0"
    }
}
#endif
