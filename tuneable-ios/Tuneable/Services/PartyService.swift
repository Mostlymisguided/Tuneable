import Foundation

/// Party API: list, search by code, get details, join. Real-time via Socket.IO can be added later.
final class PartyService {
    static let shared = PartyService()
    private let client = APIClient.shared

    func getParties() async throws -> [Party] {
        struct Response: Decodable {
            let parties: [Party]
        }
        let res: Response = try await client.get("/parties")
        return res.parties
    }

    func searchByCode(_ code: String) async throws -> Party {
        struct Response: Decodable {
            let party: Party
        }
        let res: Response = try await client.get("/parties/search-by-code/\(code)")
        return res.party
    }

    func getPartyDetails(partyId: String) async throws -> Party {
        struct Response: Decodable {
            let party: Party
        }
        let res: Response = try await client.get("/parties/\(partyId)/details")
        return res.party
    }

    /// Returns media sorted by tip value for the given time period (e.g. "today", "this-week", "this-month", "all-time").
    /// For "all-time" the frontend uses party details media; this endpoint still returns valid data.
    func getMediaSortedByTime(partyId: String, timePeriod: String) async throws -> [GlobalPartyMediaItem] {
        let res: SortedMediaResponse = try await client.get("/parties/\(partyId)/media/sorted/\(timePeriod)")
        return res.media
    }

    func joinParty(partyId: String, inviteCode: String? = nil) async throws {
        struct Body: Encodable {
            let inviteCode: String?
            let location: [String: String]?
        }
        struct Empty: Decodable {}
        let _: Empty = try await client.post("/parties/join/\(partyId)", body: Body(inviteCode: inviteCode, location: nil))
    }

    /// Add media to party with initial bid (tip). Same as web Party "Add & Tip".
    /// bidAmount in pounds (e.g. 1.10 for £1.10). Requires auth.
    func addMediaToParty(partyId: String, body: AddMediaBody) async throws -> AddMediaResponse {
        try await client.post("/parties/\(partyId)/media/add", body: body)
    }
}

struct AddMediaBody: Encodable {
    let url: String
    let title: String
    let artist: String
    let bidAmount: Double
    let platform: String
    let duration: Double?
    let coverArt: String?
    let category: String?
    let tags: [String]?

    enum CodingKeys: String, CodingKey {
        case url, title, artist, bidAmount, platform, duration, coverArt, category, tags
    }
}

struct AddMediaResponse: Decodable {
    let isNewMedia: Bool?
    let updatedBalance: Int?
    var isDuplicate: Bool? { isNewMedia.map { !$0 } }
}
