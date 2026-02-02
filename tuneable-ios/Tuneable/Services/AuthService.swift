import Foundation

/// Auth: login, profile, token storage. Uses APIClient and KeychainHelper.
final class AuthService {
    static let shared = AuthService()
    private let client = APIClient.shared

    var token: String? { KeychainHelper.string(forKey: KeychainHelper.tokenKey) }
    var isLoggedIn: Bool { token != nil }

    /// Login with email/password. Returns user and stores token + user in Keychain.
    func login(email: String, password: String) async throws -> User {
        struct LoginBody: Encodable {
            let email: String
            let password: String
        }
        struct LoginResponse: Decodable {
            let token: String
            let user: User
        }
        let data = try await client.postData("/users/login", body: LoginBody(email: email, password: password), authenticated: false)
        let decoder = JSONDecoder()
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
        do {
            let res = try decoder.decode(LoginResponse.self, from: data)
            _ = KeychainHelper.save(res.token, forKey: KeychainHelper.tokenKey)
            if let userData = try? JSONEncoder().encode(res.user) {
                _ = KeychainHelper.save(userData, forKey: KeychainHelper.userKey)
            }
            return res.user
        } catch {
            #if DEBUG
            let preview = String(data: data, encoding: .utf8).map { String($0.prefix(1500)) } ?? "nil"
            print("[Tuneable] Login decode failed. Raw response (first 1500 chars): \(preview)")
            print("[Tuneable] Decoding error: \(error)")
            #endif
            throw error
        }
    }

    /// Fetch current profile from API and optionally update stored user.
    func fetchProfile() async throws -> User {
        struct ProfileResponse: Decodable {
            let user: User
        }
        let res: ProfileResponse = try await client.get("/users/profile")
        if let data = try? JSONEncoder().encode(res.user) {
            _ = KeychainHelper.save(data, forKey: KeychainHelper.userKey)
        }
        return res.user
    }

    /// Cached user from Keychain (may be stale; use fetchProfile for fresh data).
    func cachedUser() -> User? {
        guard let data = KeychainHelper.data(forKey: KeychainHelper.userKey) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }

    /// Log out: clear token and user from Keychain.
    func logout() {
        _ = KeychainHelper.delete(forKey: KeychainHelper.tokenKey)
        _ = KeychainHelper.delete(forKey: KeychainHelper.userKey)
    }
}
