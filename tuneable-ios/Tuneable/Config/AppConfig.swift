import Foundation

/// Central config for API base URL. Set via Info.plist or Xcode build settings.
/// For dev: use http://localhost:8000 (or your machine IP for device).
enum AppConfig {
    private static let key = "TUNEABLE_API_URL"

    /// Base URL without trailing slash, e.g. https://api.tuneable.stream or http://localhost:8000
    static var apiBaseURL: String {
        if let url = Bundle.main.object(forInfoDictionaryKey: key) as? String, !url.isEmpty {
            return url.replacingOccurrences(of: "/api", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        #if DEBUG
        return "http://localhost:8000"
        #else
        return "https://api.tuneable.stream"
        #endif
    }

    /// Full API path prefix: baseURL + "/api"
    static var apiPathPrefix: String {
        "\(apiBaseURL)/api"
    }

    /// Default cover art URL for media without artwork (matches web: tuneable-frontend-v2 constants.ts)
    static let defaultCoverArtURL = "https://uploads.tuneable.stream/cover-art/default-cover.png"
}
