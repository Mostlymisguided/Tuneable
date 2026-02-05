import Foundation

/// Podcast episode (chart, search, series episodes). Resilient decoding for backend variants.
struct PodcastEpisode: Codable, Identifiable, Hashable {
    static func == (lhs: PodcastEpisode, rhs: PodcastEpisode) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    var id: String { uuid ?? _id ?? "" }
    let _id: String?
    let uuid: String?
    let title: String?
    let description: String?
    let coverArt: String?
    let duration: Double?
    let globalMediaAggregate: Double?
    let releaseDate: String?
    let podcastSeries: PodcastSeriesRef?
    let podcastTitle: String?
    let genres: [String]?
    let tags: [String]?
    let sources: [String: String]?
    let audioUrl: String?
    let enclosure: Enclosure?
    let host: [HostRef]?
    let episodeNumber: Int?
    let seasonNumber: Int?

    enum CodingKeys: String, CodingKey {
        case _id, uuid, title, description, coverArt, duration, globalMediaAggregate
        case releaseDate, podcastSeries, podcastTitle, genres, tags, sources, audioUrl, enclosure
        case host, episodeNumber, seasonNumber
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        _id = try c.decodeStringOrObjectId(forKey: ._id)
        uuid = try c.decodeStringOrObjectId(forKey: .uuid)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        coverArt = try c.decodeIfPresent(String.self, forKey: .coverArt)
        duration = try c.decodeDoubleFromIntOrDouble(forKey: .duration)
        globalMediaAggregate = try c.decodeDoubleFromIntOrDouble(forKey: .globalMediaAggregate)
        releaseDate = try c.decodeIfPresent(String.self, forKey: .releaseDate)
        podcastSeries = try c.decodeIfPresent(PodcastSeriesRef.self, forKey: .podcastSeries)
        podcastTitle = try c.decodeIfPresent(String.self, forKey: .podcastTitle)
        genres = try c.decodeStringArrayOrSingleString(forKey: .genres)
        tags = try c.decodeStringArrayOrSingleString(forKey: .tags)
        sources = try c.decodeIfPresent([String: String].self, forKey: .sources)
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        enclosure = try c.decodeIfPresent(Enclosure.self, forKey: .enclosure)
        host = try c.decodeIfPresent([HostRef].self, forKey: .host)
        episodeNumber = try c.decodeIntFromIntOrDouble(forKey: .episodeNumber)
        seasonNumber = try c.decodeIntFromIntOrDouble(forKey: .seasonNumber)
    }

    init(_id: String?, uuid: String?, title: String?, description: String?, coverArt: String?, duration: Double?, globalMediaAggregate: Double?, releaseDate: String?, podcastSeries: PodcastSeriesRef?, podcastTitle: String?, genres: [String]?, tags: [String]?, sources: [String: String]?, audioUrl: String?, enclosure: Enclosure?, host: [HostRef]?, episodeNumber: Int?, seasonNumber: Int?) {
        self._id = _id
        self.uuid = uuid
        self.title = title
        self.description = description
        self.coverArt = coverArt
        self.duration = duration
        self.globalMediaAggregate = globalMediaAggregate
        self.releaseDate = releaseDate
        self.podcastSeries = podcastSeries
        self.podcastTitle = podcastTitle
        self.genres = genres
        self.tags = tags
        self.sources = sources
        self.audioUrl = audioUrl
        self.enclosure = enclosure
        self.host = host
        self.episodeNumber = episodeNumber
        self.seasonNumber = seasonNumber
    }
}

struct PodcastSeriesRef: Codable {
    let _id: String?
    let title: String?
    let coverArt: String?
}

struct HostRef: Codable {
    let name: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = (try? c.decodeIfPresent(String.self, forKey: .name)) ?? nil
    }
    private enum CodingKeys: String, CodingKey { case name }
}

struct Enclosure: Codable {
    let url: String?
    let type: String?
}

// MARK: - Audio URL (match web getEpisodeAudioUrl)
extension PodcastEpisode {
    /// Resolve playable audio URL: sources.audio_direct, sources.audio, enclosure.url, audioUrl.
    var audioURL: URL? {
        if let u = audioUrl, let url = URL(string: u) { return url }
        if let u = enclosure?.url, let url = URL(string: u) { return url }
        guard let s = sources else { return nil }
        let u = s["audio_direct"] ?? s["audio"]
        guard let u = u else { return nil }
        return URL(string: u)
    }
}
