import Foundation

// MARK: - LogManager
// The central in-memory store for all captured APILog entries.
//
// Responsibilities:
//   1. Receive logs from NetworkInterceptor.
//   2. Apply privacy masking before storing.
//   3. Provide AI-style analysis strings for QA tester guidance.
//   4. Emit structured console output for developer visibility.
//
// Thread safety: all mutations use a concurrent queue with a barrier write;
// reads execute concurrently for maximum throughput.

final class LogManager {

    static let shared = LogManager()

    private var _logs: [APILog] = []
    private let queue = DispatchQueue(label: "com.iSpyAI.LogManager", attributes: .concurrent)

    // Observers are notified on the main queue when new logs arrive.
    var onNewLog: ((APILog) -> Void)?

    private init() {}

    // MARK: - Storage

    /// Receives a raw log, masks privacy-sensitive fields, stores it, and triggers analysis.
    func store(log: APILog) {
        #if ISPYAI_ENABLED
        let masked = applyPrivacyMask(to: log)

        queue.async(flags: .barrier) { [weak self] in
            self?._logs.append(masked)
        }

        printStructuredLog(masked)

        let analysis = analyze(log: masked)
        print("✅ iSpyAI SDK captured and analyzed API successfully")
        print("🔍 Analysis: \(analysis)\n")

        DispatchQueue.main.async { [weak self] in
            self?.onNewLog?(masked)
        }
        #endif
    }

    /// Thread-safe read of all stored logs (newest last).
    func allLogs() -> [APILog] {
        queue.sync { _logs }
    }

    /// Removes all stored logs from memory.
    func clearLogs() {
        queue.async(flags: .barrier) { [weak self] in
            self?._logs.removeAll()
        }
    }

    /// Removes a single log by its UUID.
    func deleteLog(id: UUID) {
        queue.async(flags: .barrier) { [weak self] in
            self?._logs.removeAll { $0.id == id }
        }
    }

    // MARK: - AI Analysis
    // Returns a plain-English, tester-focused insight for any captured log.
    // Designed so QA engineers can act on the result without reading raw data.

    func analyze(log: APILog) -> String {
        switch log.statusCode {
        case 401:
            return "🔐 Authentication issue: Token expired or invalid. " +
                   "Tester should verify login/session flow and check token refresh logic."
        case 403:
            return "🚫 Authorization denied: The authenticated user lacks permission. " +
                   "Tester should confirm role/scope configuration with the backend team."
        case 404:
            return "🔎 Not found: Endpoint does not exist or resource was deleted. " +
                   "Tester should validate the URL and confirm resource exists in the test environment."
        case 500...599:
            return "🔴 Server error (\(log.statusCode)): Backend failure detected. " +
                   "Tester should report an API defect with request details and server logs."
        case 200...299 where log.responseTime > 1_000:
            return "⚠️ Performance issue: Success but slow response " +
                   "(\(String(format: "%.0f", log.responseTime))ms). " +
                   "Tester should file a performance bug with a latency threshold annotation."
        case 200...299:
            return "✅ Success: API responded correctly in " +
                   "\(String(format: "%.0f", log.responseTime))ms. No action needed."
        default:
            return "ℹ️ Status \(log.statusCode): Unexpected response. " +
                   "Tester should review the response body and compare against API contract."
        }
    }

    // MARK: - Privacy Masking
    // Masks credential fields before any log is persisted.
    // Extend this list as new sensitive header names are identified.

    private func applyPrivacyMask(to log: APILog) -> APILog {
        var headers = log.requestHeaders

        let sensitiveKeys = ["authorization", "x-api-key", "x-auth-token", "cookie", "set-cookie"]
        for key in headers.keys {
            if sensitiveKeys.contains(key.lowercased()) {
                headers[key] = key.lowercased().hasPrefix("authorization") ? "Bearer *****" : "*****"
            }
        }

        return APILog(
            id:              log.id,
            endpoint:        log.endpoint,
            method:          log.method,
            requestHeaders:  headers,
            responseHeaders: log.responseHeaders,
            statusCode:      log.statusCode,
            responseBody:    log.responseBody,
            responseTime:    log.responseTime,
            timestamp:       log.timestamp
        )
    }

    // MARK: - Structured Console Output

    private func printStructuredLog(_ log: APILog) {
        let separator = String(repeating: "─", count: 56)
        print("""
        ┌\(separator)
        │  iSpyAI SDK — Captured API Log
        │  ▸ Endpoint   : \(log.endpoint)
        │  ▸ Method     : \(log.method)
        │  ▸ Status     : \(log.statusCode)
        │  ▸ Time       : \(String(format: "%.2f", log.responseTime))ms
        │  ▸ Timestamp  : \(formattedDate(log.timestamp))
        └\(separator)
        """)
    }

    private func formattedDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return f.string(from: date)
    }
}
