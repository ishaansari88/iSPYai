import Foundation

// MARK: - APIService
// The host-app-facing networking layer for the iSpyAI demo.
// Provides a URLSession pre-wired with NetworkInterceptor so every request
// is automatically captured without any extra work from the call site.
//
// SDK Integration note:
//   In a real integration (e.g. Practina), the host app would either:
//   a) Replace its own URLSession config with one that includes NetworkInterceptor, or
//   b) Use iSpyAI's session wrapper (this class) directly for instrumented calls.

final class APIService {

    static let shared = APIService()

    // This session has NetworkInterceptor injected at the configuration level.
    // Only traffic through this session is captured — no global side effects.
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        #if ISPYAI_ENABLED
        config.protocolClasses = [NetworkInterceptor.self]
        #endif
        session = URLSession(configuration: config)
    }

    // MARK: - Public API

    /// Performs an HTTP GET request and delivers raw data or an error on the main queue.
    func get(urlString: String, completion: @escaping (Result<Data, Error>) -> Void) {
        guard let url = URL(string: urlString) else {
            completion(.failure(URLError(.badURL)))
            return
        }

        session.dataTask(with: url) { data, _, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                } else if let data = data {
                    completion(.success(data))
                } else {
                    completion(.failure(URLError(.zeroByteResource)))
                }
            }
        }.resume()
    }

    /// Performs a generic URLRequest and delivers raw data on the main queue.
    func execute(_ request: URLRequest, completion: @escaping (Result<Data, Error>) -> Void) {
        session.dataTask(with: request) { data, _, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(error))
                } else if let data = data {
                    completion(.success(data))
                } else {
                    completion(.failure(URLError(.zeroByteResource)))
                }
            }
        }.resume()
    }
}
