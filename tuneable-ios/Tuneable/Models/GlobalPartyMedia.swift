import Foundation

/// Bid on a media item (from sorted/media API); userId populated with username, profilePic, uuid.
struct GlobalPartyBid: Codable {
    /// Amount in pence (API may send as Int or Double).
    private let amountValue: Double?
    let userId: GlobalPartyBidUser?

    var amount: Int? {
        guard let v = amountValue, v >= 0 else { return nil }
        return Int(v.rounded())
    }

    enum CodingKeys: String, CodingKey {
        case amountValue = "amount"
        case userId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let d = try c.decodeIfPresent(Double.self, forKey: .amountValue) {
            amountValue = d
        } else if let i = try c.decodeIfPresent(Int.self, forKey: .amountValue) {
            amountValue = Double(i)
        } else {
            amountValue = nil
        }
        userId = try c.decodeIfPresent(GlobalPartyBidUser.self, forKey: .userId)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(amountValue, forKey: .amountValue)
        try c.encodeIfPresent(userId, forKey: .userId)
    }
}

struct GlobalPartyBidUser: Codable {
    let username: String?
    let profilePic: String?
    let uuid: String?
}

/// Flattened media item from global party details or sorted-by-time API (camelCase from backend).
/// Backend includes `sources` (e.g. youtube, upload URLs) for playback.
struct GlobalPartyMediaItem: Codable, Identifiable {
    var id: String { idFromAPI ?? _id ?? uuid ?? "" }
    private let idFromAPI: String?
    let _id: String?
    let uuid: String?
    let title: String?
    let artist: String?
    let duration: Double?
    let coverArt: String?
    let partyMediaAggregate: Int?
    let tags: [String]?
    let status: String?
    let bids: [GlobalPartyBid]?
    /// Playback URLs by platform: e.g. ["youtube": "https://...", "upload": "https://..."]
    let sources: [String: String]?

    enum CodingKeys: String, CodingKey {
        case idFromAPI = "id"
        case _id, uuid, title, artist, duration, coverArt, partyMediaAggregate, tags, status, bids, sources
    }

    /// First playable URL: youtube preferred, then upload, then any value.
    var playbackURL: URL? {
        guard let s = sources else { return nil }
        let urlString = s["youtube"] ?? s["upload"] ?? s.values.first
        guard let urlString = urlString, !urlString.isEmpty else { return nil }
        return URL(string: urlString)
    }

    /// True when the primary source is YouTube (embed in WKWebView). Otherwise use direct URL (e.g. audio).
    var isYouTubeSource: Bool {
        guard let s = sources, let yt = s["youtube"], !yt.isEmpty else { return false }
        return yt.contains("youtube.com") || yt.contains("youtu.be")
    }

    /// YouTube video ID for embed URL, or nil if not YouTube.
    var youtubeVideoId: String? {
        guard isYouTubeSource, let urlString = sources?["youtube"] else { return nil }
        return Self.extractYouTubeVideoId(from: urlString)
    }

    /// Extracts video ID from youtube.com/watch?v=ID, youtu.be/ID, or youtube.com/embed/ID.
    static func extractYouTubeVideoId(from urlString: String) -> String? {
        let patterns = [
            "youtube.com/watch?v=",
            "youtu.be/",
            "youtube.com/embed/"
        ]
        for prefix in patterns {
            if let range = urlString.range(of: prefix) {
                let after = String(urlString[range.upperBound...])
                let end = after.firstIndex(where: { $0 == "&" || $0 == "?" || $0 == "#" }) ?? after.endIndex
                let id = String(after[..<end]).trimmingCharacters(in: .whitespaces)
                return id.isEmpty ? nil : id
            }
        }
        return nil
    }
}

/// Response from GET /parties/:partyId/media/sorted/:timePeriod
struct SortedMediaResponse: Codable {
    let timePeriod: String
    let media: [GlobalPartyMediaItem]
    let count: Int
}
