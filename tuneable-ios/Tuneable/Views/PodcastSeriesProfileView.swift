import SwiftUI

struct PodcastSeriesProfileView: View {
    let seriesId: String
    @State private var series: PodcastSeriesDetail?
    @State private var episodes: [PodcastEpisode] = []
    @State private var stats: PodcastSeriesStats?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading && series == nil {
                ProgressView("Loading series…")
                    .tint(AppTheme.textPrimary)
                    .foregroundStyle(AppTheme.textPrimary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let msg = errorMessage, series == nil {
                ContentUnavailableView {
                    Label("Couldn't load series", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(AppTheme.textPrimary)
                } description: {
                    Text(msg)
                        .foregroundStyle(AppTheme.textSecondary)
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let s = series {
                            seriesHeader(s)
                        }
                        if let st = stats {
                            statsRow(st)
                        }
                        Text("Episodes")
                            .font(.headline)
                            .foregroundStyle(AppTheme.textPrimary)
                            .padding(.horizontal)
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
        .navigationTitle(series?.title ?? "Series")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .refreshable { await load() }
        .onAppear { Task { await load() } }
    }

    private func seriesHeader(_ s: PodcastSeriesDetail) -> some View {
        HStack(alignment: .top, spacing: 16) {
            if let url = s.coverArt.flatMap({ URL(string: $0) }) ?? URL(string: AppConfig.defaultCoverArtURL) {
                AsyncImage(url: url) { ph in
                    ph.resizable().scaledToFill()
                } placeholder: {
                    Rectangle().fill(.gray.opacity(0.3))
                }
                .frame(width: 100, height: 100)
                .clipped()
                .cornerRadius(10)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(s.title ?? "Untitled")
                    .font(.title2)
                    .foregroundStyle(AppTheme.textPrimary)
                if let d = s.description, !d.isEmpty {
                    Text(d.strippingHTML)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
    }

    private func statsRow(_ st: PodcastSeriesStats) -> some View {
        HStack(spacing: 24) {
            if let n = st.totalEpisodes {
                VStack(spacing: 2) {
                    Text("\(n)")
                        .font(.headline)
                        .foregroundStyle(AppTheme.textPrimary)
                    Text("Episodes")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
            if let t = st.totalTips, t > 0 {
                VStack(spacing: 2) {
                    Text(formatPence(t))
                        .font(.headline)
                        .foregroundStyle(AppTheme.textPrimary)
                    Text("Total tips")
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textSecondary)
                }
            }
        }
        .padding(.horizontal)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let res = try await PodcastService.shared.getSeries(seriesId: seriesId)
            series = res.series
            episodes = res.episodes ?? []
            stats = res.stats
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private func formatPence(_ pence: Double) -> String {
    let safe = pence.isFinite && !pence.isNaN ? pence : 0
    let pounds = safe / 100
    return pounds >= 1 ? String(format: "£%.2f", pounds) : "\(Int(safe))p"
}

#Preview {
    NavigationStack {
        PodcastSeriesProfileView(seriesId: "abc")
    }
}
