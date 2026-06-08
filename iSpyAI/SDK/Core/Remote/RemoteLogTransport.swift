#if ISPYAI_ENABLED
import Foundation

// MARK: - RemoteLogTransport
// Owns the one outbound channel from the device to the iSpyAI backend.
//
// Design goals:
//   - Never throw to the caller (the SDK must not crash a host app).
//   - Bounded memory: queued logs are capped at 500; oldest are dropped on
//     overflow with a single console warning per overflow.
//   - WebSocket-first, HTTP fallback: keeps end-to-end latency low while
//     surviving intermittent socket failures.
//   - Exponential backoff (1, 2, 4, 8, 16, 30s cap) for reconnection.
//
// Wire format matches `backend/src/realtime/deviceWebSocket.ts`:
//   - Hello: {"type":"hello", sessionId, deviceName?, appVersion?, buildNumber?}
//   - Log:   {"type":"log", "log": <APILog>}

public actor RemoteLogTransport {

    public static let shared = RemoteLogTransport()

    private enum Connection {
        case disconnected
        case connecting
        case connected
    }

    private let urlSession: URLSession
    private var task: URLSessionWebSocketTask?
    private var connection: Connection = .disconnected
    private var helloSent: Bool = false

    private var queue: [APILog] = []
    private let queueCap: Int = 500
    private var overflowReportedAt: Date?

    private var reconnectAttempt: Int = 0
    private var reconnectInFlight: Bool = false

    private var listenLoopID: UUID?

    public init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    // MARK: - Public API

    /// Stamp and enqueue a log for delivery. Safe to call from any thread.
    public func send(_ log: APILog) async {
        let cfg = IspyAIConfig.shared
        guard cfg.remoteMonitoringEnabled, cfg.backendURL != nil else { return }

        let prepared = prepareForWire(log, config: cfg)
        enqueue(prepared)
        await drain()
    }

    /// Eagerly announce this device's session metadata. Idempotent; safe to call
    /// any number of times. Invoked automatically before the first send too.
    public func hello() async {
        let cfg = IspyAIConfig.shared
        guard cfg.remoteMonitoringEnabled, let baseURL = cfg.backendURL else { return }

        let payload: [String: Any] = [
            "sessionId":   cfg.sessionId,
            "deviceName":  cfg.deviceName,
            "appVersion":  cfg.appVersion,
            "buildNumber": cfg.buildNumber
        ]
        await postJSON(to: baseURL.appendingPathComponent("v1/sessions"), payload: payload)
    }

    /// Cancel the open socket and any pending reconnect work. After this the
    /// next `send` will lazily reconnect on demand.
    public func shutdown() async {
        listenLoopID = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        connection = .disconnected
        helloSent = false
        reconnectAttempt = 0
        reconnectInFlight = false
    }

    // MARK: - Queueing

    private func enqueue(_ log: APILog) {
        if queue.count >= queueCap {
            queue.removeFirst(queue.count - queueCap + 1)
            reportOverflowIfNeeded()
        }
        queue.append(log)
    }

    private func reportOverflowIfNeeded() {
        let now = Date()
        if let last = overflowReportedAt, now.timeIntervalSince(last) < 30 { return }
        overflowReportedAt = now
        print("iSpyAI WARN: remote transport queue overflow; dropping oldest logs")
    }

    // MARK: - Connection lifecycle

    private func wsURL(from baseURL: URL) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.path = (components?.path ?? "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        // Promote http(s) -> ws(s); leave ws(s) untouched.
        switch components?.scheme {
        case "http":  components?.scheme = "ws"
        case "https": components?.scheme = "wss"
        default: break
        }
        var url = components?.url ?? baseURL
        url.appendPathComponent("realtime/device")
        return url
    }

    private func ensureConnected() async {
        guard let cfg = IspyAIConfig.shared.backendURL else { return }
        switch connection {
        case .connected, .connecting:
            return
        case .disconnected:
            break
        }
        connection = .connecting
        let url = wsURL(from: cfg)
        let task = urlSession.webSocketTask(with: url)
        self.task = task
        task.resume()
        connection = .connected
        reconnectAttempt = 0
        helloSent = false
        startListenLoop(taskID: UUID())
    }

    private func startListenLoop(taskID: UUID) {
        listenLoopID = taskID
        Task { [weak self] in
            guard let self else { return }
            await self.listen(loopID: taskID)
        }
    }

    private func listen(loopID: UUID) async {
        guard let task = task else { return }
        do {
            while listenLoopID == loopID, connection == .connected {
                _ = try await task.receive()
                // The server sends "ack" / "error" frames. We don't currently
                // need to react to acks; future work could surface errors.
            }
        } catch {
            // Connection died. Mark as disconnected and trigger reconnect.
            await markDisconnectedAndReconnect()
        }
    }

    private func markDisconnectedAndReconnect() async {
        connection = .disconnected
        task?.cancel(with: .abnormalClosure, reason: nil)
        task = nil
        helloSent = false
        await scheduleReconnect()
    }

    private func scheduleReconnect() async {
        guard !reconnectInFlight else { return }
        reconnectInFlight = true
        let delay = nextBackoffDelay()
        reconnectAttempt += 1
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        reconnectInFlight = false
        await drain()
    }

    private func nextBackoffDelay() -> TimeInterval {
        // 1, 2, 4, 8, 16, 30 (cap) seconds.
        let schedule: [TimeInterval] = [1, 2, 4, 8, 16, 30]
        let idx = min(reconnectAttempt, schedule.count - 1)
        return schedule[idx]
    }

    // MARK: - Draining

    private func drain() async {
        await ensureConnected()
        guard connection == .connected, let task = task else {
            // Couldn't connect — fall straight to HTTP fallback for each queued log.
            await fallbackDrain()
            return
        }

        if !helloSent {
            let cfg = IspyAIConfig.shared
            let hello: [String: Any] = [
                "type":        "hello",
                "sessionId":   cfg.sessionId,
                "deviceName":  cfg.deviceName,
                "appVersion":  cfg.appVersion,
                "buildNumber": cfg.buildNumber
            ]
            if !(await sendJSONFrame(hello, over: task)) {
                await markDisconnectedAndReconnect()
                await fallbackDrain()
                return
            }
            helloSent = true
        }

        while !queue.isEmpty {
            let log = queue[0]
            let encoded = encodeLogFrame(log)
            guard let encoded = encoded else {
                queue.removeFirst()
                continue
            }
            if await sendRawFrame(encoded, over: task) {
                queue.removeFirst()
            } else {
                await markDisconnectedAndReconnect()
                await fallbackDrain()
                return
            }
        }
    }

    private func fallbackDrain() async {
        guard let baseURL = IspyAIConfig.shared.backendURL else { return }
        let endpoint = baseURL.appendingPathComponent("v1/logs")
        while !queue.isEmpty {
            let log = queue[0]
            let ok = await postLog(log, to: endpoint)
            if ok {
                queue.removeFirst()
            } else {
                // HTTP failed too; keep the queue and wait for the next call.
                return
            }
        }
    }

    // MARK: - Encoding

    private func prepareForWire(_ log: APILog, config cfg: IspyAIConfig) -> APILog {
        let maskedHeaders = maskHeaders(log.requestHeaders, using: cfg.headerMaskKeys)
        let maskedResHeaders = maskHeaders(log.responseHeaders, using: cfg.headerMaskKeys)
        let truncatedBody = truncate(log.responseBody, maxBytes: cfg.maxBodyBytes)

        return APILog(
            id:              log.id,
            endpoint:        log.endpoint,
            method:          log.method,
            requestHeaders:  maskedHeaders,
            responseHeaders: maskedResHeaders,
            statusCode:      log.statusCode,
            responseBody:    truncatedBody,
            responseTime:    log.responseTime,
            timestamp:       log.timestamp,
            sessionId:       log.sessionId ?? cfg.sessionId,
            deviceName:      log.deviceName ?? cfg.deviceName,
            appVersion:      log.appVersion ?? cfg.appVersion,
            buildNumber:     log.buildNumber ?? cfg.buildNumber
        )
    }

    private func maskHeaders(
        _ headers: [String: String],
        using keys: Set<String>
    ) -> [String: String] {
        guard !keys.isEmpty else { return headers }
        let normalized = Set(keys.map { $0.lowercased() })
        var out = headers
        for (k, _) in headers {
            if normalized.contains(k.lowercased()) {
                out[k] = "*****"
            }
        }
        return out
    }

    private func truncate(_ body: String, maxBytes: Int) -> String {
        guard maxBytes > 0 else { return body }
        let data = Data(body.utf8)
        if data.count <= maxBytes { return body }
        let slice = data.prefix(maxBytes)
        let head = String(data: slice, encoding: .utf8) ?? ""
        return head + "\n... [truncated \(data.count - maxBytes) bytes]"
    }

    private func encodeLogFrame(_ log: APILog) -> Data? {
        let encoder = JSONEncoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(formatter.string(from: date))
        }
        do {
            let logData = try encoder.encode(log)
            guard let logObject = try JSONSerialization.jsonObject(with: logData) as? [String: Any] else {
                return nil
            }
            let frame: [String: Any] = ["type": "log", "log": logObject]
            return try JSONSerialization.data(withJSONObject: frame)
        } catch {
            return nil
        }
    }

    // MARK: - Transport primitives

    private func sendJSONFrame(_ object: [String: Any], over task: URLSessionWebSocketTask) async -> Bool {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return false }
        return await sendRawFrame(data, over: task)
    }

    private func sendRawFrame(_ data: Data, over task: URLSessionWebSocketTask) async -> Bool {
        let message = URLSessionWebSocketTask.Message.data(data)
        return await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            task.send(message) { error in
                continuation.resume(returning: error == nil)
            }
        }
    }

    private func postLog(_ log: APILog, to url: URL) async -> Bool {
        let encoder = JSONEncoder()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(formatter.string(from: date))
        }
        guard let body = try? encoder.encode(log) else { return false }
        return await postRaw(body, to: url)
    }

    private func postJSON(to url: URL, payload: [String: Any]) async {
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        _ = await postRaw(body, to: url)
    }

    private func postRaw(_ body: Data, to url: URL) async -> Bool {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        do {
            let (_, response) = try await urlSession.data(for: request)
            if let http = response as? HTTPURLResponse {
                return (200...299).contains(http.statusCode)
            }
            return false
        } catch {
            return false
        }
    }
}
#endif
