import SwiftUI

struct PodcastMiniBarView: View {
    @EnvironmentObject private var podcastPlayer: PodcastPlayerStore
    @Binding var showNowPlaying: Bool

    var body: some View {
        if let episode = podcastPlayer.currentEpisode {
            Button {
                showNowPlaying = true
            } label: {
                VStack(spacing: 0) {
                    progressBar
                    HStack(spacing: 12) {
                        coverImage(episode: episode)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(episode.title ?? "Untitled")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(AppTheme.textPrimary)
                                .lineLimit(1)
                            Text(episode.podcastSeries?.title ?? episode.podcastTitle ?? "")
                                .font(.caption)
                                .foregroundStyle(AppTheme.textSecondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        Button {
                            podcastPlayer.togglePlayPause()
                        } label: {
                            Image(systemName: podcastPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                .font(.system(size: 44))
                                .foregroundStyle(AppTheme.accent)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(AppTheme.gradientStart)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var progressBar: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let progress = width > 0 && podcastPlayer.duration > 0
                ? min(1, max(0, podcastPlayer.currentTime / podcastPlayer.duration))
                : 0.0
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(AppTheme.cardBackground)
                Rectangle()
                    .fill(AppTheme.accent)
                    .frame(width: width * progress)
            }
        }
        .frame(height: 3)
    }

    private func coverImage(episode: PodcastEpisode) -> some View {
        let url = episode.coverArt.flatMap(URL.init(string:))
            ?? episode.podcastSeries?.coverArt.flatMap(URL.init(string:))
            ?? URL(string: AppConfig.defaultCoverArtURL)
        return Group {
            if let u = url {
                AsyncImage(url: u) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure, .empty:
                        Rectangle().fill(.quaternary)
                    @unknown default:
                        Rectangle().fill(.quaternary)
                    }
                }
            } else {
                Rectangle().fill(.quaternary)
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

#Preview {
    VStack {
        Spacer()
        PodcastMiniBarView(showNowPlaying: .constant(false))
            .environmentObject(PodcastPlayerStore())
    }
}
