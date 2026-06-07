import Foundation

// MARK: - APILog
// Core data model representing a single captured network transaction.
// This is the fundamental unit of information stored by the iSpyAI SDK.

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

    init(
        id: UUID = UUID(),
        endpoint: String,
        method: String,
        requestHeaders: [String: String],
        responseHeaders: [String: String],
        statusCode: Int,
        responseBody: String,
        responseTime: Double,
        timestamp: Date = Date()
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
    }
}
