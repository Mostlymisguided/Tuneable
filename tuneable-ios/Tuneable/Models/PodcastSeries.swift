import Foundation

/// Top-series list item (aggregate result).
struct PodcastSeriesItem: Codable, Identifiable, Hashable {
    static func == (lhs: PodcastSeriesItem, rhs: PodcastSeriesItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    var id: String { _id ?? "" }
    let _id: String?
    let title: String?
    let coverArt: String?
    let description: String?
    let genres: [String]?
    let totalGlobalMediaAggregate: Double?
    let episodeCount: Int?

    enum CodingKeys: String, CodingKey {
        case _id, title, coverArt, description, genres, totalGlobalMediaAggregate, episodeCount
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = try c.decodeStringOrObjectId(forKey: ._id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        coverArt = try c.decodeIfPresent(String.self, forKey: .coverArt)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        genres = try c.decodeStringArrayOrSingleString(forKey: .genres)
        totalGlobalMediaAggregate = try c.decodeDoubleFromIntOrDouble(forKey: .totalGlobalMediaAggregate)
        episodeCount = try c.decodeIntFromIntOrDouble(forKey: .episodeCount)
    }
    init(_id: String?, title: String?, coverArt: String?, description: String?, genres: [String]?, totalGlobalMediaAggregate: Double?, episodeCount: Int?) {
        self._id = _id
        self.title = title
        self.coverArt = coverArt
        self.description = description
        self.genres = genres
        self.totalGlobalMediaAggregate = totalGlobalMediaAggregate
        self.episodeCount = episodeCount
    }
}

/// Full series detail (GET /podcasts/series/:id).
struct PodcastSeriesDetail: Codable {
    let _id: String?
    let uuid: String?
    let title: String?
    let description: String?
    let summary: String?
    let coverArt: String?
    let host: [HostRef]?
    let genres: [String]?
    let tags: [String]?
    let language: String?
    let explicit: Bool?

    enum CodingKeys: String, CodingKey {
        case _id, uuid, title, description, summary, coverArt, host, genres, tags, language, explicit
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = (try? c.decodeStringOrObjectId(forKey: ._id)) ?? nil
        uuid = (try? c.decodeStringOrObjectId(forKey: .uuid)) ?? nil
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? nil
        description = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? nil
        summary = (try? c.decodeIfPresent(String.self, forKey: .summary)) ?? nil
        coverArt = (try? c.decodeIfPresent(String.self, forKey: .coverArt)) ?? nil
        host = (try? c.decodeIfPresent([HostRef].self, forKey: .host)) ?? nil
        genres = (try? c.decodeStringArrayOrSingleString(forKey: .genres)) ?? nil
        tags = (try? c.decodeStringArrayOrSingleString(forKey: .tags)) ?? nil
        language = (try? c.decodeIfPresent(String.self, forKey: .language)) ?? nil
        explicit = (try? c.decodeIfPresent(Bool.self, forKey: .explicit)) ?? nil
    }
}

struct PodcastSeriesStats: Codable {
    let totalEpisodes: Int?
    let totalTips: Double?
    let avgTip: Double?
    let topEpisode: TopEpisodeRef?

    enum CodingKeys: String, CodingKey {
        case totalEpisodes, totalTips, avgTip, topEpisode
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        totalEpisodes = (try? c.decodeIntFromIntOrDouble(forKey: .totalEpisodes)) ?? nil
        totalTips = (try? c.decodeDoubleFromIntOrDouble(forKey: .totalTips)) ?? nil
        avgTip = (try? c.decodeDoubleFromIntOrDouble(forKey: .avgTip)) ?? nil
        topEpisode = (try? c.decodeIfPresent(TopEpisodeRef.self, forKey: .topEpisode)) ?? nil
    }
}

struct TopEpisodeRef: Codable {
    let _id: String?
    let title: String?
    let globalMediaAggregate: Double?

    enum CodingKeys: String, CodingKey {
        case _id, title, globalMediaAggregate
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = try c.decodeStringOrObjectId(forKey: ._id)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        globalMediaAggregate = try c.decodeDoubleFromIntOrDouble(forKey: .globalMediaAggregate)
    }
}
