import Foundation

/// Podcast API: chart, top episodes/series, search, series detail, media profile, global bid (tip).
final class PodcastService {
    static let shared = PodcastService()
    private let client = APIClient.shared

    // MARK: - Chart & discovery

    struct ChartResponse: Decodable {
        let episodes: [PodcastEpisode]?
        let filters: ChartFilters?
    }
    struct ChartFilters: Decodable {
        let categories: [String]?
        let genres: [String]?
        let tags: [String]?
    }

    func getChart(category: String? = nil, genre: String? = nil, tag: String? = nil, timeRange: String = "all", sortBy: String = "globalMediaAggregate", limit: Int = 50) async throws -> (episodes: [PodcastEpisode], filters: ChartFilters?) {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "timeRange", value: timeRange),
            URLQueryItem(name: "sortBy", value: sortBy),
        ]
        if let c = category, !c.isEmpty { items.append(URLQueryItem(name: "category", value: c)) }
        if let g = genre, !g.isEmpty { items.append(URLQueryItem(name: "genre", value: g)) }
        if let t = tag, !t.isEmpty { items.append(URLQueryItem(name: "tag", value: t)) }
        let res: ChartResponse = try await client.get("/podcasts/chart", queryItems: items.isEmpty ? nil : items)
        return (res.episodes ?? [], res.filters)
    }

    func getTopEpisodes(limit: Int = 10) async throws -> [PodcastEpisode] {
        struct R: Decodable { let episodes: [PodcastEpisode]? }
        let res: R = try await client.get("/podcasts/top-episodes", queryItems: [URLQueryItem(name: "limit", value: "\(limit)")])
        return res.episodes ?? []
    }

    func getTopSeries(limit: Int = 10) async throws -> [PodcastSeriesItem] {
        struct R: Decodable { let series: [PodcastSeriesItem]? }
        let res: R = try await client.get("/podcasts/top-series", queryItems: [URLQueryItem(name: "limit", value: "\(limit)")])
        return res.series ?? []
    }

    // MARK: - Search

    struct SearchResponse: Decodable {
        let episodes: [PodcastEpisode]?
        let hasMore: Bool?
        let total: Int?
    }

    func searchEpisodes(q: String, category: String? = nil, genre: String? = nil, tag: String? = nil, limit: Int = 50, offset: Int = 0) async throws -> (episodes: [PodcastEpisode], hasMore: Bool) {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "q", value: q),
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
        ]
        if let c = category, !c.isEmpty { items.append(URLQueryItem(name: "category", value: c)) }
        if let g = genre, !g.isEmpty { items.append(URLQueryItem(name: "genre", value: g)) }
        if let t = tag, !t.isEmpty { items.append(URLQueryItem(name: "tag", value: t)) }
        let res: SearchResponse = try await client.get("/podcasts/search-episodes", queryItems: items)
        let list = res.episodes ?? []
        let total = res.total ?? 0
        let hasMore = res.hasMore ?? (offset + list.count < total)
        return (list, hasMore)
    }

    // MARK: - Series detail

    /// Wrapper to decode array elements resiliently: skips episodes that fail to decode
    private struct FailableEpisodeWrapper: Decodable {
        let episode: PodcastEpisode?
        init(from decoder: Decoder) throws {
            episode = try? PodcastEpisode(from: decoder)
        }
    }

    struct SeriesDetailResponse: Decodable {
        let series: PodcastSeriesDetail?
        let episodes: [PodcastEpisode]?
        let stats: PodcastSeriesStats?

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            series = try? c.decode(PodcastSeriesDetail.self, forKey: .series)
            // Decode episodes resiliently: backend format may vary; skip any that fail
            if let wrapped = try? c.decode([FailableEpisodeWrapper].self, forKey: .episodes) {
                episodes = wrapped.compactMap(\.episode)
            } else {
                episodes = nil
            }
            stats = try? c.decode(PodcastSeriesStats.self, forKey: .stats)
        }
        private enum CodingKeys: String, CodingKey { case series, episodes, stats }
    }

    func getSeries(seriesId: String, limit: Int = 20, offset: Int = 0, autoImport: Bool = true) async throws -> SeriesDetailResponse {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
        ]
        items.append(URLQueryItem(name: "autoImport", value: autoImport ? "true" : "false"))
        let res: SeriesDetailResponse = try await client.get("/podcasts/series/\(seriesId)", queryItems: items)
        return res
    }

    // MARK: - Media profile (episode detail)

    struct MediaProfileResponse: Decodable {
        let media: PodcastEpisode?
    }

    func getMediaProfile(mediaId: String) async throws -> PodcastEpisode {
        struct R: Decodable { let media: PodcastEpisode? }
        let res: R = try await client.get("/media/\(mediaId)/profile")
        guard let m = res.media else { throw APIError.invalidResponse }
        return m
    }

    // MARK: - Global bid (tip)

    /// Place a global bid (tip). Backend expects amount in pounds (e.g. 1.10 for £1.10).
    func placeGlobalBid(mediaId: String, amountPence: Int) async throws {
        struct Body: Encodable { let amount: Double }
        struct Empty: Decodable {}
        let amountPounds = Double(amountPence) / 100
        let _: Empty = try await client.post("/media/\(mediaId)/global-bid", body: Body(amount: amountPounds))
    }
}
