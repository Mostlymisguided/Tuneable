import Foundation
import AVFoundation

@MainActor
final class PodcastPlayerStore: ObservableObject {
    @Published private(set) var currentEpisode: PodcastEpisode?
    @Published private(set) var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Double = 1.0

    private var player: AVPlayer?
    private var timeObserver: Any?

    private static let playbackRates: [Double] = [1.0, 1.25, 1.5, 2.0]

    init() {}

    func setEpisode(_ episode: PodcastEpisode?) {
        stop()
        currentEpisode = episode
        guard let ep = episode, let url = ep.audioURL else { return }
        let item = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: item)
        player?.rate = Float(playbackRate)
        let d = ep.duration ?? 0
        duration = (d.isFinite && d >= 0) ? d : 0
        currentTime = 0
        addTimeObserver()
    }

    func play() {
        guard let p = player else { return }
        p.rate = Float(playbackRate)
        p.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    func seek(to time: TimeInterval) {
        guard let p = player else { return }
        let safe = min(max(0, time), max(0, duration))
        currentTime = safe
        p.seek(to: CMTime(seconds: safe, preferredTimescale: CMTimeScale(NSEC_PER_SEC)))
    }

    func skipBack(seconds: TimeInterval = 15) {
        seek(to: currentTime - seconds)
    }

    func skipForward(seconds: TimeInterval = 15) {
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
        player?.rate = Float(playbackRate)
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
    }

    private func addTimeObserver() {
        guard let p = player else { return }
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = p.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                let sec = time.seconds
                self?.currentTime = (sec.isFinite && sec >= 0) ? sec : 0
                if self?.duration ?? 0 <= 0, let item = p.currentItem {
                    let d = item.asset.duration
                    if d.isNumeric {
                        let s = d.seconds
                        self?.duration = (s.isFinite && s >= 0) ? s : 0
                    }
                }
            }
        }
    }
}
