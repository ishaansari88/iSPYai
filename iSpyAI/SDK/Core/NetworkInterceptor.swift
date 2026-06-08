import Foundation

// MARK: - NetworkInterceptor
// Intercepts all URLSession traffic for sessions that include this protocol class.
// Uses the URLProtocol subclassing mechanism — the standard iOS interception pattern.
//
// SDK Integration note:
//   When embedding into a host app, pass this class in URLSessionConfiguration.protocolClasses
//   rather than registering it globally, to avoid intercepting unrelated third-party SDKs.

final class NetworkInterceptor: URLProtocol {

    // Key used to tag requests we've already begun processing, preventing infinite recursion.
    private static let handledKey = "iSpyAI_Handled"

    private var activeTask: URLSessionDataTask?
    private var captureStartTime: Date?

    // MARK: - URLProtocol — Required Overrides

    /// Only intercept requests that haven't already been tagged by this interceptor.
    override class func canInit(with request: URLRequest) -> Bool {
        #if ISPYAI_ENABLED
        // Skip traffic to the iSpyAI backend itself so we don't recursively
        // instrument the transport's own delivery requests.
        if let selfHost = IspyAIConfig.shared.backendURL?.host,
           let requestHost = request.url?.host,
           selfHost.caseInsensitiveCompare(requestHost) == .orderedSame {
            return false
        }
        #endif
        return URLProtocol.property(forKey: handledKey, in: request) == nil
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    // MARK: - Lifecycle

    override func startLoading() {
        guard let mutable = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        // Tag this request so canInit returns false for the internal retry below.
        URLProtocol.setProperty(true, forKey: NetworkInterceptor.handledKey, in: mutable)

        captureStartTime = Date()

        // Use a plain .default session (no custom protocol classes) to avoid recursion.
        let session = URLSession(configuration: .default)

        activeTask = session.dataTask(with: mutable as URLRequest) { [weak self] data, response, error in
            guard let self else { return }

            let elapsed = self.captureStartTime.map {
                Date().timeIntervalSince($0) * 1_000
            } ?? 0

            if let error = error {
                self.client?.urlProtocol(self, didFailWithError: error)
                return
            }

            if let response = response {
                self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            }

            if let data = data {
                self.client?.urlProtocol(self, didLoad: data)
                self.buildAndStoreLog(
                    request: self.request,
                    response: response,
                    data: data,
                    responseTime: elapsed
                )
            }

            self.client?.urlProtocolDidFinishLoading(self)
        }
        activeTask?.resume()
    }

    override func stopLoading() {
        activeTask?.cancel()
        activeTask = nil
    }

    // MARK: - Log Construction

    private func buildAndStoreLog(
        request: URLRequest,
        response: URLResponse?,
        data: Data,
        responseTime: Double
    ) {
        let endpoint      = request.url?.absoluteString ?? "Unknown"
        let method        = request.httpMethod ?? "GET"
        let requestHeaders = request.allHTTPHeaderFields ?? [:]

        var statusCode      = 0
        var responseHeaders = [String: String]()

        if let http = response as? HTTPURLResponse {
            statusCode = http.statusCode
            http.allHeaderFields.forEach { key, value in
                if let k = key as? String, let v = value as? String {
                    responseHeaders[k] = v
                }
            }
        }

        let body = String(data: data, encoding: .utf8) ?? "<binary or non-UTF8 data>"

        let log = APILog(
            endpoint:        endpoint,
            method:          method,
            requestHeaders:  requestHeaders,
            responseHeaders: responseHeaders,
            statusCode:      statusCode,
            responseBody:    body,
            responseTime:    responseTime
        )

        LogManager.shared.store(log: log)
    }
}
