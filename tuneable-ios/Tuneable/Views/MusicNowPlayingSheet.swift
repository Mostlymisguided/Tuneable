import SwiftUI

struct MusicNowPlayingSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var musicPlayer: MusicPlayerStore

    @State private var scrubberValue: Double = 0
    @State private var isScrubbing = false

    var body: some View {
        Group {
            if let item = musicPlayer.currentItem {
                content(item: item)
            } else {
                Text("Nothing playing")
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
        .onAppear {
            scrubberValue = musicPlayer.currentTime
        }
        .onChange(of: musicPlayer.currentTime) { _, newValue in
            if !isScrubbing {
                scrubberValue = newValue
            }
        }
        .onChange(of: musicPlayer.duration) { _, _ in
            if !isScrubbing {
                scrubberValue = musicPlayer.currentTime
            }
        }
        .onChange(of: musicPlayer.currentItem?.id) { _, newValue in
            if newValue == nil {
                dismiss()
            }
        }
    }

    private func content(item: GlobalPartyMediaItem) -> some View {
        VStack(spacing: 0) {
            header
            Spacer()
            coverSection(item: item)
            Spacer()
            titleSection(item: item)
            progressSection
            controlsSection
            queueContext
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

    private func coverSection(item: GlobalPartyMediaItem) -> some View {
        let url = item.coverArt.flatMap(URL.init(string:))
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

    private func titleSection(item: GlobalPartyMediaItem) -> some View {
        VStack(spacing: 4) {
            Text(item.title ?? "Untitled")
                .font(.title2.weight(.semibold))
                .foregroundStyle(AppTheme.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(item.artist ?? "")
                .font(.subheadline)
                .foregroundStyle(AppTheme.textSecondary)
        }
        .padding(.vertical, 16)
    }

    private var progressSection: some View {
        VStack(spacing: 8) {
            Slider(
                value: $scrubberValue,
                in: 0 ... max(1, musicPlayer.duration),
                onEditingChanged: { editing in
                    isScrubbing = editing
                    if !editing {
                        musicPlayer.seek(to: scrubberValue)
                    }
                }
            )
            .tint(AppTheme.accent)

            HStack {
                Text(formatTime(scrubberValue))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(AppTheme.textSecondary)
                Spacer()
                Text(formatTime(musicPlayer.duration))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(AppTheme.textSecondary)
            }
        }
        .padding(.bottom, 24)
    }

    private var controlsSection: some View {
        HStack(spacing: 32) {
            Button {
                musicPlayer.previous()
            } label: {
                Image(systemName: "backward.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(AppTheme.textPrimary)
            }
            .disabled(!musicPlayer.hasPrevious)

            Button {
                musicPlayer.togglePlayPause()
            } label: {
                Image(systemName: musicPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(AppTheme.accent)
            }

            Button {
                musicPlayer.next()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(AppTheme.textPrimary)
            }
            .disabled(!musicPlayer.hasNext)
        }
        .padding(.bottom, 16)
    }

    private var queueContext: some View {
        if musicPlayer.queue.count > 1 {
            Text("Track \(musicPlayer.currentIndex + 1) of \(musicPlayer.queue.count)")
                .font(.caption)
                .foregroundStyle(AppTheme.textTertiary)
        }
    }

    private func formatTime(_ seconds: Double) -> String {
        let s = seconds.isFinite && !seconds.isNaN && seconds >= 0 ? seconds : 0
        let m = Int(s) / 60
        let sec = Int(s) % 60
        return String(format: "%d:%02d", m, sec)
    }
}
