import Foundation

// MARK: - APILog
// Core data model representing a single captured network transaction.
// This is the fundamental unit of information stored by the iSpyAI SDK.
//
// Remote-monitoring fields (`sessionId`, `deviceName`, `appVersion`,
// `buildNumber`) are optional so existing call sites compile unchanged.
// The remote transport stamps them in just before delivery.

struct APILog: Identifiable {

    let id: UUID

    /// Full URL of the request endpoint.
    let endpoint: String

    /// HTTP method (GET, POST, PUT, DELETE, etc.).
    let method: String

    /// Request headers sent with the call. Sensitive values are masked before storage.
    let requestHeaders: [String: String]

    /// Response headers returned by the server.
    let responseHeaders: [String: String]

    /// HTTP status code returned (200, 401, 500, etc.).
    let statusCode: Int

    /// Response body as a UTF-8 string. Binary data is noted but not stored raw.
    let responseBody: String

    /// Round-trip response time in milliseconds.
    let responseTime: Double

    /// Wall-clock timestamp of when the request was captured.
    let timestamp: Date

    /// Identifier of the device/run this log belongs to. Set by the SDK
    /// when remote monitoring is enabled; ignored otherwise.
    let sessionId: String?

    /// Human-readable device name (e.g. "Isha's iPhone").
    let deviceName: String?

    /// Host app marketing version (CFBundleShortVersionString).
    let appVersion: String?

    /// Host app build number (CFBundleVersion).
    let buildNumber: String?

    init(
        id: UUID = UUID(),
        endpoint: String,
        method: String,
        requestHeaders: [String: String],
        responseHeaders: [String: String],
        statusCode: Int,
        responseBody: String,
        responseTime: Double,
        timestamp: Date = Date(),
        sessionId: String? = nil,
        deviceName: String? = nil,
        appVersion: String? = nil,
        buildNumber: String? = nil
    ) {
        self.id = id
        self.endpoint = endpoint
        self.method = method
        self.requestHeaders = requestHeaders
        self.responseHeaders = responseHeaders
        self.statusCode = statusCode
        self.responseBody = responseBody
        self.responseTime = responseTime
        self.timestamp = timestamp
        self.sessionId = sessionId
        self.deviceName = deviceName
        self.appVersion = appVersion
        self.buildNumber = buildNumber
    }
}

#if ISPYAI_ENABLED

// MARK: - Wire encoding
// Codable conformance is gated to the remote-monitoring build because the
// in-memory pipeline never needs serialization. Keeping it inside the flag
// preserves the original SDK's zero-overhead default.

extension APILog: Codable {

    private enum CodingKeys: String, CodingKey {
        case id
        case endpoint
        case method
        case requestHeaders
        case responseHeaders
        case statusCode
        case responseBody
        case responseTime
        case timestamp
        case sessionId
        case deviceName
        case appVersion
        case buildNumber
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let idString = try c.decode(String.self, forKey: .id)
        guard let parsedID = UUID(uuidString: idString) else {
            throw DecodingError.dataCorruptedError(
                forKey: .id,
                in: c,
                debugDescription: "id is not a valid UUID"
            )
        }
        let isoString = try c.decode(String.self, forKey: .timestamp)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let parsedTimestamp = formatter.date(from: isoString) ?? Date()

        self.init(
            id:              parsedID,
            endpoint:        try c.decode(String.self, forKey: .endpoint),
            method:          try c.decode(String.self, forKey: .method),
            requestHeaders:  try c.decode([String: String].self, forKey: .requestHeaders),
            responseHeaders: try c.decode([String: String].self, forKey: .responseHeaders),
            statusCode:      try c.decode(Int.self, forKey: .statusCode),
            responseBody:    try c.decode(String.self, forKey: .responseBody),
            responseTime:    try c.decode(Double.self, forKey: .responseTime),
            timestamp:       parsedTimestamp,
            sessionId:       try c.decodeIfPresent(String.self, forKey: .sessionId),
            deviceName:      try c.decodeIfPresent(String.self, forKey: .deviceName),
            appVersion:      try c.decodeIfPresent(String.self, forKey: .appVersion),
            buildNumber:     try c.decodeIfPresent(String.self, forKey: .buildNumber)
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id.uuidString, forKey: .id)
        try c.encode(endpoint, forKey: .endpoint)
        try c.encode(method, forKey: .method)
        try c.encode(requestHeaders, forKey: .requestHeaders)
        try c.encode(responseHeaders, forKey: .responseHeaders)
        try c.encode(statusCode, forKey: .statusCode)
        try c.encode(responseBody, forKey: .responseBody)
        try c.encode(responseTime, forKey: .responseTime)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try c.encode(formatter.string(from: timestamp), forKey: .timestamp)

        try c.encodeIfPresent(sessionId, forKey: .sessionId)
        try c.encodeIfPresent(deviceName, forKey: .deviceName)
        try c.encodeIfPresent(appVersion, forKey: .appVersion)
        try c.encodeIfPresent(buildNumber, forKey: .buildNumber)
    }
}

#endif
