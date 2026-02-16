import SwiftUI

struct NowPlayingSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var podcastPlayer: PodcastPlayerStore

    @State private var scrubberValue: Double = 0
    @State private var isScrubbing = false

    var body: some View {
        Group {
            if let episode = podcastPlayer.currentEpisode {
                content(episode: episode)
            } else {
                Text("Nothing playing")
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
        .onAppear {
            scrubberValue = podcastPlayer.currentTime
        }
        .onChange(of: podcastPlayer.currentTime) { _, newValue in
            if !isScrubbing {
                scrubberValue = newValue
            }
        }
        .onChange(of: podcastPlayer.duration) { _, _ in
            if !isScrubbing {
                scrubberValue = podcastPlayer.currentTime
            }
        }
        .onChange(of: podcastPlayer.currentEpisode) { _, newValue in
            if newValue == nil {
                dismiss()
            }
        }
    }

    private func content(episode: PodcastEpisode) -> some View {
        VStack(spacing: 0) {
            header
            Spacer()
            coverSection(episode: episode)
            Spacer()
            titleSection(episode: episode)
            progressSection
            controlsSection
            playbackRateButton
            Spacer(minLength: 32)
        }
        .padding(.horizontal, 24)
        .background(PurpleGradientBackground())
    }

    private var header: some View {
        HStack {
            Button("Done") {
                dismiss()
            }
            .foregroundStyle(AppTheme.accent)
            Spacer()
        }
        .padding(.top, 8)
        .padding(.bottom, 16)
    }

    private func coverSection(episode: PodcastEpisode) -> some View {
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
        .frame(maxWidth: 280, maxHeight: 280)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
    }

    private func titleSection(episode: PodcastEpisode) -> some View {
        VStack(spacing: 4) {
            Text(episode.title ?? "Untitled")
                .font(.title2.weight(.semibold))
                .foregroundStyle(AppTheme.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(episode.podcastSeries?.title ?? episode.podcastTitle ?? "")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
        }
        .padding(.vertical, 16)
    }

    private var progressSection: some View {
        VStack(spacing: 8) {
            Slider(
                value: $scrubberValue,
                in: 0 ... max(1, podcastPlayer.duration),
                onEditingChanged: { editing in
                    isScrubbing = editing
                    if !editing {
                        podcastPlayer.seek(to: scrubberValue)
                    }
                }
            )
            .tint(AppTheme.accent)

            HStack {
                Text(formatTime(scrubberValue))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Text(formatTime(podcastPlayer.duration))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
        .padding(.bottom, 24)
    }

    private var controlsSection: some View {
        HStack(spacing: 32) {
            Button {
                podcastPlayer.skipBack(seconds: 15)
            } label: {
                Image(systemName: "gobackward.15")
                    .font(.system(size: 36))
                    .foregroundStyle(AppTheme.textPrimary)
            }

            Button {
                podcastPlayer.togglePlayPause()
            } label: {
                Image(systemName: podcastPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(AppTheme.accent)
            }

            Button {
                podcastPlayer.skipForward(seconds: 15)
            } label: {
                Image(systemName: "goforward.15")
                    .font(.system(size: 36))
                    .foregroundStyle(AppTheme.textPrimary)
            }
        }
        .padding(.bottom, 16)
    }

    private var playbackRateButton: some View {
        Button {
            podcastPlayer.cyclePlaybackRate()
        } label: {
            Text("\(formatRate(podcastPlayer.playbackRate))×")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(AppTheme.textSecondary)
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let s = seconds.isFinite && !seconds.isNaN && seconds >= 0 ? seconds : 0
        let m = Int(s) / 60
        let sec = Int(s) % 60
        return String(format: "%d:%02d", m, sec)
    }

    private func formatRate(_ rate: Double) -> String {
        if rate == rate.rounded() {
            return String(format: "%.0f", rate)
        }
        return String(format: "%.2g", rate)
    }
}

#Preview {
    NowPlayingSheet()
        .environmentObject(PodcastPlayerStore())
}
