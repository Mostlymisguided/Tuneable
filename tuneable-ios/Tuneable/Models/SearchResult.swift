import Foundation

/// Single item from search API (GET /search or GET /search/youtube-url). Matches backend format.
struct SearchResultItem: Codable, Identifiable {
    var id: String { _id ?? idFromAPI ?? uuid ?? "" }
    private let idFromAPI: String?
    let _id: String?
    let uuid: String?
    let title: String?
    let artist: String?
    let coverArt: String?
    let duration: Double?
    /// sources.youtube or sources.upload URL
    let sources: [String: String]?
    let isLocal: Bool?
    let tags: [String]?
    let category: String?

    enum CodingKeys: String, CodingKey {
        case idFromAPI = "id"
        case _id, uuid, title, artist, coverArt, duration, sources, isLocal, tags, category
    }

    /// YouTube or first available URL for adding to party.
    var url: String? {
        guard let s = sources else { return nil }
        return s["youtube"] ?? s["upload"] ?? s.values.first
    }

    /// Platform for add-media: "youtube" or "upload"
    var platform: String {
        guard let s = sources else { return "youtube" }
        if s["youtube"] != nil { return "youtube" }
        if s["upload"] != nil { return "upload" }
        return "youtube"
    }
}

/// Response from GET /search
struct SearchResponse: Codable {
    let source: String?       // "local" | "external"
    let videos: [SearchResultItem]?
    let nextPageToken: String?
    let hasMoreExternal: Bool?
}
