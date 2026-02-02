import Foundation

/// Party model matching backend API (camelCase from Mongoose).
struct Party: Codable, Identifiable, Hashable {
    var id: String { uuid ?? _id ?? "" }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: Party, rhs: Party) -> Bool { lhs.id == rhs.id }
    let _id: String?
    let uuid: String?
    let name: String
    let location: String
    let partyCode: String
    let host: PartyUser?
    let partiers: [PartyUser]?
    let media: [PartyMedia]?
    let startTime: String?
    let endTime: String?
    let privacy: String?
    let type: String?
    let status: String?
    let watershed: Bool?
    let minimumBid: Double?
    let createdAt: String?
    let updatedAt: String?
}

struct PartyUser: Codable {
    let id: String?
    let _id: String?
    let uuid: String?
    let userId: String?
    let username: String?
}

struct PartyMedia: Codable, Identifiable {
    var id: String { _id ?? uuid ?? "" }
    let _id: String?
    let uuid: String?
    let title: String?
    let artists: [String]?
    let source: String?
    let sourceId: String?
    let coverArtUrl: String?
    let durationSeconds: Double?
    let order: Int?
}
