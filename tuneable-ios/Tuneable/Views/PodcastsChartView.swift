import SwiftUI

struct PodcastsChartView: View {
    @State private var episodes: [PodcastEpisode] = []
    @State private var topEpisodes: [PodcastEpisode] = []
    @State private var topSeries: [PodcastSeriesItem] = []
    @State private var filters: PodcastService.ChartFilters?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedCategory: String?
    @State private var selectedGenre: String?
    @State private var selectedTag: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && episodes.isEmpty {
                    ProgressView("Loading podcasts…")
                        .tint(AppTheme.textPrimary)
                        .foregroundStyle(AppTheme.textPrimary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let msg = errorMessage, episodes.isEmpty {
                    ContentUnavailableView {
                        Label("Couldn't load chart", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(AppTheme.textPrimary)
                    } description: {
                        Text(msg)
                            .foregroundStyle(AppTheme.textSecondary)
                    } actions: {
                        Button("Retry") { Task { await loadChart() } }
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            if !topSeries.isEmpty {
                                sectionHeader("Top series")
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 12) {
                                        ForEach(topSeries) { s in
                                            NavigationLink(value: s) {
                                                SeriesCard(item: s)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                            }
                            if !topEpisodes.isEmpty {
                                sectionHeader("Top episodes")
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 12) {
                                        ForEach(topEpisodes) { ep in
                                            NavigationLink(value: ep) {
                                                EpisodeCardSmall(episode: ep)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                            }
                            sectionHeader("Chart")
                            LazyVStack(spacing: 0) {
                                ForEach(episodes) { ep in
                                    NavigationLink(value: ep) {
                                        EpisodeRow(episode: ep)
                                    }
                                    Divider()
                                        .background(AppTheme.cardBorder)
                                }
                            }
                            .padding(.horizontal)
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
            .background(PurpleGradientBackground())
            .foregroundStyle(AppTheme.textPrimary)
            .navigationTitle("Podcasts")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(destination: PodcastSearchView()) {
                        Image(systemName: "magnifyingglass")
                    }
                }
            }
            .refreshable { await loadChart() }
            .onAppear { Task { await loadChart() } }
            .navigationDestination(for: PodcastEpisode.self) { ep in
                PodcastEpisodeProfileView(episodeId: ep.id)
            }
            .navigationDestination(for: PodcastSeriesItem.self) { item in
                PodcastSeriesProfileView(seriesId: item.id)
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(AppTheme.textPrimary)
            .padding(.horizontal)
            .padding(.top, 8)
    }

    private func loadChart() async {
        isLoading = true
        errorMessage = nil
        do {
            let (eps, filt) = try await PodcastService.shared.getChart()
            episodes = eps
            filters = filt
            topEpisodes = try await PodcastService.shared.getTopEpisodes(limit: 10)
            topSeries = try await PodcastService.shared.getTopSeries(limit: 10)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct SeriesCard: View {
    let item: PodcastSeriesItem

    private var coverArtURL: URL? {
        item.coverArt.flatMap { URL(string: $0) } ?? URL(string: AppConfig.defaultCoverArtURL)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let url = coverArtURL {
                AsyncImage(url: url) { ph in
                    ph.resizable().scaledToFill()
                } placeholder: {
                    Rectangle().fill(.gray.opacity(0.3))
                }
                .frame(width: 120, height: 120)
                .clipped()
                .cornerRadius(8)
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(.gray.opacity(0.3))
                    .frame(width: 120, height: 120)
            }
            Text(item.title ?? "Untitled")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)
                .lineLimit(2)
                .frame(width: 120, alignment: .leading)
            if let agg = item.totalGlobalMediaAggregate, agg > 0 {
                Text(formatPence(agg))
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
        .frame(width: 130)
    }
}

struct EpisodeCardSmall: View {
    let episode: PodcastEpisode

    private var coverArtURL: URL? {
        episode.coverArt.flatMap { URL(string: $0) }
            ?? episode.podcastSeries?.coverArt.flatMap { URL(string: $0) }
            ?? URL(string: AppConfig.defaultCoverArtURL)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let url = coverArtURL {
                AsyncImage(url: url) { ph in
                    ph.resizable().scaledToFill()
                } placeholder: {
                    Rectangle().fill(.gray.opacity(0.3))
                }
                .frame(width: 100, height: 100)
                .clipped()
                .cornerRadius(8)
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(.gray.opacity(0.3))
                    .frame(width: 100, height: 100)
            }
            Text(episode.title ?? "Untitled")
                .font(.caption)
                .foregroundStyle(AppTheme.textPrimary)
                .lineLimit(2)
                .frame(width: 100, alignment: .leading)
            Text(episode.podcastSeries?.title ?? episode.podcastTitle ?? "")
                .font(.caption2)
                .foregroundStyle(AppTheme.textSecondary)
                .lineLimit(1)
                .frame(width: 100, alignment: .leading)
        }
        .frame(width: 110)
    }
}

struct EpisodeRow: View {
    let episode: PodcastEpisode

    private var coverArtURL: URL? {
        episode.coverArt.flatMap { URL(string: $0) }
            ?? episode.podcastSeries?.coverArt.flatMap { URL(string: $0) }
            ?? URL(string: AppConfig.defaultCoverArtURL)
    }

    var body: some View {
        HStack(spacing: 12) {
            if let url = coverArtURL {
                AsyncImage(url: url) { ph in
                    ph.resizable().scaledToFill()
                } placeholder: {
                    Rectangle().fill(.gray.opacity(0.3))
                }
                .frame(width: 56, height: 56)
                .clipped()
                .cornerRadius(6)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(episode.title ?? "Untitled")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textPrimary)
                    .lineLimit(1)
                Text(episode.podcastSeries?.title ?? episode.podcastTitle ?? "")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                    .lineLimit(1)
                if let agg = episode.globalMediaAggregate, agg > 0 {
                    Text(formatPence(agg))
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textTertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(AppTheme.textTertiary)
        }
        .padding(.vertical, 8)
    }
}

private func formatPence(_ pence: Double) -> String {
    let safe = pence.isFinite && !pence.isNaN ? pence : 0
    let pounds = safe / 100
    return pounds >= 1 ? String(format: "£%.2f", pounds) : "\(Int(safe))p"
}

#Preview {
    PodcastsChartView()
}
