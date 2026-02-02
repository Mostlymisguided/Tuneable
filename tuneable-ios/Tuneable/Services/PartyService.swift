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

    func joinParty(partyId: String, inviteCode: String? = nil) async throws {
        struct Body: Encodable {
            let inviteCode: String?
            let location: [String: String]?
        }
        struct Empty: Decodable {}
        let _: Empty = try await client.post("/parties/join/\(partyId)", body: Body(inviteCode: inviteCode, location: nil))
    }
}
