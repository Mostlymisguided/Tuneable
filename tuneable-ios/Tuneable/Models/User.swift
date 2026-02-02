import Foundation

/// User model matching backend API (camelCase from Mongoose).
struct User: Codable, Identifiable {
    var id: String { uuid ?? _id ?? "" }
    let _id: String?
    let uuid: String?
    /// Backend may omit for some OAuth/legacy users; use displayUsername/displayEmail in UI.
    let username: String?
    let email: String?
    let profilePic: String?
    let personalInviteCode: String?
    /// Balance in pence. Backend may send Int or Double.
    let balance: Double?
    let role: [String]?
    let isActive: Bool?
    let joinedParties: [JoinedParty]?
    let homeLocation: Location?
    let creatorProfile: CreatorProfile?
    let emailVerified: Bool?
    let tuneBytes: Int?

    enum CodingKeys: String, CodingKey {
        case _id, uuid, username, email, profilePic, personalInviteCode, balance
        case role, isActive, joinedParties, homeLocation, creatorProfile, emailVerified, tuneBytes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = try c.decodeStringOrObjectId(forKey: ._id)
        uuid = try c.decodeStringOrObjectId(forKey: .uuid)
        username = try c.decodeIfPresent(String.self, forKey: .username)
        email = try c.decodeIfPresent(String.self, forKey: .email)
        profilePic = try c.decodeIfPresent(String.self, forKey: .profilePic)
        personalInviteCode = try c.decodeIfPresent(String.self, forKey: .personalInviteCode)
        balance = try c.decodeDoubleFromIntOrDouble(forKey: .balance)
        role = try c.decodeStringArrayOrSingleString(forKey: .role)
        isActive = try c.decodeIfPresent(Bool.self, forKey: .isActive)
        joinedParties = try c.decodeIfPresent([JoinedParty].self, forKey: .joinedParties)
        homeLocation = try c.decodeIfPresent(Location.self, forKey: .homeLocation)
        creatorProfile = try c.decodeIfPresent(CreatorProfile.self, forKey: .creatorProfile)
        emailVerified = try c.decodeIfPresent(Bool.self, forKey: .emailVerified)
        tuneBytes = try c.decodeIntFromIntOrDouble(forKey: .tuneBytes)
    }

    init(_id: String?, uuid: String?, username: String?, email: String?, profilePic: String?, personalInviteCode: String?, balance: Double?, role: [String]?, isActive: Bool?, joinedParties: [JoinedParty]?, homeLocation: Location?, creatorProfile: CreatorProfile?, emailVerified: Bool?, tuneBytes: Int?) {
        self._id = _id
        self.uuid = uuid
        self.username = username
        self.email = email
        self.profilePic = profilePic
        self.personalInviteCode = personalInviteCode
        self.balance = balance
        self.role = role
        self.isActive = isActive
        self.joinedParties = joinedParties
        self.homeLocation = homeLocation
        self.creatorProfile = creatorProfile
        self.emailVerified = emailVerified
        self.tuneBytes = tuneBytes
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(_id, forKey: ._id)
        try c.encodeIfPresent(uuid, forKey: .uuid)
        try c.encodeIfPresent(username, forKey: .username)
        try c.encodeIfPresent(email, forKey: .email)
        try c.encodeIfPresent(profilePic, forKey: .profilePic)
        try c.encodeIfPresent(personalInviteCode, forKey: .personalInviteCode)
        try c.encodeIfPresent(balance, forKey: .balance)
        try c.encodeIfPresent(role, forKey: .role)
        try c.encodeIfPresent(isActive, forKey: .isActive)
        try c.encodeIfPresent(joinedParties, forKey: .joinedParties)
        try c.encodeIfPresent(homeLocation, forKey: .homeLocation)
        try c.encodeIfPresent(creatorProfile, forKey: .creatorProfile)
        try c.encodeIfPresent(emailVerified, forKey: .emailVerified)
        try c.encodeIfPresent(tuneBytes, forKey: .tuneBytes)
    }
}

extension KeyedDecodingContainer {
    /// Decodes optional Double when backend sends Int or Double (e.g. balance in pence).
    func decodeDoubleFromIntOrDouble(forKey key: Key) throws -> Double? {
        guard contains(key) else { return nil }
        if let i = try? decode(Int.self, forKey: key) { return Double(i) }
        return try decodeIfPresent(Double.self, forKey: key)
    }

    /// Decodes optional Int when backend sends Int or Double (e.g. tuneBytes).
    func decodeIntFromIntOrDouble(forKey key: Key) throws -> Int? {
        guard contains(key) else { return nil }
        if let i = try? decode(Int.self, forKey: key) { return i }
        if let d = try? decode(Double.self, forKey: key) { return Int(d) }
        return nil
    }

    /// Decodes optional string; accepts plain string or MongoDB-style { "$oid": "..." }.
    func decodeStringOrObjectId(forKey key: Key) throws -> String? {
        guard contains(key) else { return nil }
        if let s = try? decode(String.self, forKey: key) { return s }
        if let obj = try? decode([String: String].self, forKey: key), let oid = obj["$oid"] { return oid }
        return nil
    }

    /// Decodes optional [String]; accepts array or a single string (normalized to one-element array).
    func decodeStringArrayOrSingleString(forKey key: Key) throws -> [String]? {
        guard contains(key) else { return nil }
        if let arr = try? decode([String].self, forKey: key) { return arr }
        if let s = try? decode(String.self, forKey: key) { return [s] }
        return nil
    }
}

struct JoinedParty: Codable {
    let partyId: String?
    let joinedAt: String?
    let role: String?
}

struct Location: Codable {
    let city: String?
    let region: String?
    let country: String?
    let countryCode: String?
}

struct CreatorProfile: Codable {
    let artistName: String?
    let verificationStatus: String?
    let bio: String?
    let genres: [String]?
}
