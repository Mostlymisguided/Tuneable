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

    enum CodingKeys: String, CodingKey {
        case idFromAPI = "id"
        case _id, uuid, title, artist, duration, coverArt, partyMediaAggregate, tags, status, bids
    }
}

/// Response from GET /parties/:partyId/media/sorted/:timePeriod
struct SortedMediaResponse: Codable {
    let timePeriod: String
    let media: [GlobalPartyMediaItem]
    let count: Int
}
