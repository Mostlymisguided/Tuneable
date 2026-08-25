import Foundation
import AVFoundation
import MediaPlayer
import UIKit

@MainActor
final class PodcastPlayerStore: ObservableObject {
    @Published private(set) var currentEpisode: PodcastEpisode?
    @Published private(set) var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Double = 1.0

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var remoteCommandsReady = false
    private var artworkURLString: String?

    private static let playbackRates: [Double] = [1.0, 1.25, 1.5, 2.0]

    init() {
        setupRemoteCommands()
    }

    func setEpisode(_ episode: PodcastEpisode?) {
        stop()
        currentEpisode = episode
        guard let ep = episode, let url = ep.audioURL else { return }
        configureSession()
        let item = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: item)
        player?.rate = Float(playbackRate)
        let d = ep.duration ?? 0
        duration = (d.isFinite && d >= 0) ? d : 0
        currentTime = 0
        addTimeObserver()
        updateNowPlaying(reloadArtwork: true)
    }

    func play() {
        guard let p = player else { return }
        configureSession()
        p.rate = Float(playbackRate)
        p.play()
        isPlaying = true
        updateNowPlaying()
    }

    func pause() {
        player?.pause()
        isPlaying = false
        updateNowPlaying()
    }

    func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    func seek(to time: TimeInterval) {
        guard let p = player else { return }
        let safe = min(max(0, time), max(0, duration))
        currentTime = safe
        p.seek(to: CMTime(seconds: safe, preferredTimescale: CMTimeScale(NSEC_PER_SEC)))
        updateNowPlaying()
    }

    func skipBack(seconds: TimeInterval = 15) {
        seek(to: currentTime - seconds)
    }

    func skipForward(seconds: TimeInterval = 30) {
        seek(to: currentTime + seconds)
    }

    func cyclePlaybackRate() {
        guard let idx = Self.playbackRates.firstIndex(of: playbackRate) else {
            playbackRate = 1.0
            applyPlaybackRate()
            return
        }
        playbackRate = Self.playbackRates[(idx + 1) % Self.playbackRates.count]
        applyPlaybackRate()
    }

    private func applyPlaybackRate() {
        if isPlaying {
            player?.rate = Float(playbackRate)
        }
        updateNowPlaying()
    }

    func stop() {
        if let p = player, let obs = timeObserver {
            p.removeTimeObserver(obs)
        }
        timeObserver = nil
        player?.pause()
        player = nil
        currentEpisode = nil
        isPlaying = false
        currentTime = 0
        duration = 0
        artworkURLString = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func configureSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true)
        } catch {}
    }

    private func addTimeObserver() {
        guard let p = player else { return }
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                let sec = time.seconds
                self?.currentTime = (sec.isFinite && sec >= 0) ? sec : 0
                if self?.duration ?? 0 <= 0, let item = p.currentItem {
                    if let d = try? await item.asset.load(.duration), d.isNumeric {
                        let s = d.seconds
                        self?.duration = (s.isFinite && s >= 0) ? s : 0
                    }
                }
                self?.updateNowPlayingElapsed()
            }
        }
    }

    private func setupRemoteCommands() {
        guard !remoteCommandsReady else { return }
        remoteCommandsReady = true
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.isEnabled = true
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.play() }
            return .success
        }

        center.pauseCommand.isEnabled = true
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }

        center.togglePlayPauseCommand.isEnabled = true
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.togglePlayPause() }
            return .success
        }

        center.skipBackwardCommand.isEnabled = true
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] event in
            let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 15
            Task { @MainActor in self?.skipBack(seconds: seconds) }
            return .success
        }

        center.skipForwardCommand.isEnabled = true
        center.skipForwardCommand.preferredIntervals = [30]
        center.skipForwardCommand.addTarget { [weak self] event in
            let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 30
            Task { @MainActor in self?.skipForward(seconds: seconds) }
            return .success
        }

        center.changePlaybackPositionCommand.isEnabled = true
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            Task { @MainActor in self?.seek(to: event.positionTime) }
            return .success
        }
    }

    private func updateNowPlaying(reloadArtwork: Bool = false) {
        guard let episode = currentEpisode else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = episode.title ?? "Episode"
        info[MPMediaItemPropertyArtist] = episode.podcastSeries?.title ?? episode.podcastTitle ?? "Podcast"
        info[MPMediaItemPropertyAlbumTitle] = "Tuneable"
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        info[MPMediaItemPropertyPlaybackDuration] = duration
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? playbackRate : 0.0
        info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = playbackRate
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        if reloadArtwork {
            loadArtwork(for: episode)
        }
    }

    private func updateNowPlayingElapsed() {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else { return }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        info[MPMediaItemPropertyPlaybackDuration] = duration
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? playbackRate : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadArtwork(for episode: PodcastEpisode) {
        let urlString = episode.coverArt ?? episode.podcastSeries?.coverArt
        guard let urlString, let url = URL(string: urlString), urlString != artworkURLString else { return }
        artworkURLString = urlString
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                guard let image = UIImage(data: data) else { return }
                let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            } catch {}
        }
    }
}
