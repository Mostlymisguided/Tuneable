import Foundation

/// Search API: query Tuneable DB and YouTube (same as web Party search).
final class SearchService {
    static let shared = SearchService()
    private let client = APIClient.shared

    /// GET /search?query=...&source=youtube&pageToken=...&forceExternal=true
    /// Returns local and/or external results. When hasMoreExternal is true, call again with forceExternal to get YouTube.
    func search(
        query: String,
        source: String = "youtube",
        pageToken: String? = nil,
        forceExternal: Bool = false
    ) async throws -> SearchResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "source", value: source),
        ]
        if let pt = pageToken, !pt.isEmpty {
            items.append(URLQueryItem(name: "pageToken", value: pt))
        }
        if forceExternal {
            items.append(URLQueryItem(name: "forceExternal", value: "true"))
        }
        return try await client.get("/search", queryItems: items.isEmpty ? nil : items, authenticated: false)
    }

    /// GET /search/youtube-url?url=...
    func searchByYouTubeUrl(_ url: String) async throws -> SearchResponse {
        let items = [URLQueryItem(name: "url", value: url)]
        return try await client.get("/search/youtube-url", queryItems: items, authenticated: false)
    }
}
