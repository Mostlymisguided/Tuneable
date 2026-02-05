import Foundation

/// Low-level HTTP client for Tuneable API (REST). Uses Bearer JWT from Keychain.
final class APIClient {
    static let shared = APIClient()
    private let baseURL: String
    private let session: URLSession

    init(baseURL: String = AppConfig.apiPathPrefix, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    /// Build full URL for path (e.g. "/users/login" -> "http://localhost:8000/api/users/login")
    func url(for path: String, queryItems: [URLQueryItem]? = nil) -> URL? {
        var comp = URLComponents(string: "\(baseURL)\(path.hasPrefix("/") ? path : "/\(path)")")
        comp?.queryItems = queryItems
        return comp?.url
    }

    /// Default headers including auth if token exists.
    func headers(includeAuth: Bool = true) -> [String: String] {
        var h: [String: String] = [
            "Content-Type": "application/json",
            "Accept": "application/json",
        ]
        if includeAuth, let token = KeychainHelper.string(forKey: KeychainHelper.tokenKey) {
            h["Authorization"] = "Bearer \(token)"
        }
        return h
    }

    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil, authenticated: Bool = true) async throws -> T {
        try await request(path: path, method: "GET", body: nil, queryItems: queryItems, authenticated: authenticated)
    }

    func post<T: Decodable>(_ path: String, body: Encodable?, authenticated: Bool = true) async throws -> T {
        try await request(path: path, method: "POST", body: body, queryItems: nil, authenticated: authenticated)
    }

    /// Returns raw response data on 2xx; throws on non-2xx. Use when you need to inspect/decode manually (e.g. login debug).
    func postData(_ path: String, body: Encodable?, authenticated: Bool = true) async throws -> Data {
        try await requestData(path: path, method: "POST", body: body, queryItems: nil, authenticated: authenticated)
    }

    private func requestData(
        path: String,
        method: String,
        body: Encodable?,
        queryItems: [URLQueryItem]?,
        authenticated: Bool
    ) async throws -> Data {
        guard let url = url(for: path, queryItems: queryItems) else {
            throw APIError.invalidURL(path)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        for (k, v) in headers(includeAuth: authenticated) { req.setValue(v, forHTTPHeaderField: k) }
        if let body = body {
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401, authenticated {
            _ = KeychainHelper.delete(forKey: KeychainHelper.tokenKey)
            _ = KeychainHelper.delete(forKey: KeychainHelper.userKey)
            throw APIError.unauthorized
        }
        if http.statusCode < 200 || http.statusCode >= 300 {
            let message = (try? JSONDecoder().decode(APIErrorResponse.self, from: data))?.error ?? String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.http(statusCode: http.statusCode, message: message)
        }
        return data
    }

    func put<T: Decodable>(_ path: String, body: Encodable?, authenticated: Bool = true) async throws -> T {
        try await request(path: path, method: "PUT", body: body, queryItems: nil, authenticated: authenticated)
    }

    func delete<T: Decodable>(_ path: String, authenticated: Bool = true) async throws -> T {
        try await request(path: path, method: "DELETE", body: nil, queryItems: nil, authenticated: authenticated)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        body: Encodable?,
        queryItems: [URLQueryItem]?,
        authenticated: Bool
    ) async throws -> T {
        guard let url = url(for: path, queryItems: queryItems) else {
            throw APIError.invalidURL(path)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        for (k, v) in headers(includeAuth: authenticated) { request.setValue(v, forHTTPHeaderField: k) }
        if let body = body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if http.statusCode == 401, authenticated {
            _ = KeychainHelper.delete(forKey: KeychainHelper.tokenKey)
            _ = KeychainHelper.delete(forKey: KeychainHelper.userKey)
            throw APIError.unauthorized
        }

        if http.statusCode < 200 || http.statusCode >= 300 {
            let message = (try? JSONDecoder().decode(APIErrorResponse.self, from: data))?.error ?? String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.http(statusCode: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        // Backend (Mongoose) returns camelCase; no snake_case conversion
        decoder.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = formatter.date(from: s) { return d }
            formatter.formatOptions = [.withInternetDateTime]
            if let d = formatter.date(from: s) { return d }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid date: \(s)")
        }
        return try decoder.decode(T.self, from: data)
    }
}

enum APIError: LocalizedError {
    case invalidURL(String)
    case invalidResponse
    case unauthorized
    case http(statusCode: Int, message: String)

    var isUnauthorized: Bool { if case .unauthorized = self { return true }; return false }

    var errorDescription: String? {
        switch self {
        case .invalidURL(let path): return "Invalid URL: \(path)"
        case .invalidResponse: return "Invalid response"
        case .unauthorized: return "Session expired. Please sign in again."
        case .http(let code, let msg): return "\(msg) (HTTP \(code))"
        }
    }
}

private struct APIErrorResponse: Decodable {
    let error: String?
}

private struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
