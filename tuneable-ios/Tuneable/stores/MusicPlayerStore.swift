import Foundation

@MainActor
final class MusicPlayerStore: ObservableObject {
    @Published private(set) var queue: [GlobalPartyMediaItem] = []
    @Published private(set) var currentIndex: Int = 0
    @Published var isPlaying: Bool = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    /// When set, the playback view should seek to this time and then clear it.
    @Published var seekTarget: TimeInterval?
    /// True when the music now-playing sheet is presented; background WebView pauses so the sheet’s visible WebView can play.
    @Published var isMusicSheetPresented: Bool = false

    var currentItem: GlobalPartyMediaItem? {
        guard currentIndex >= 0, currentIndex < queue.count else { return nil }
        return queue[currentIndex]
    }

    var hasNext: Bool { currentIndex + 1 < queue.count }
    var hasPrevious: Bool { currentIndex > 0 }

    init() {}

    /// Set queue and start from the given index (default 0). Same logic as web: play the displayed queue.
    func setQueueAndPlay(_ items: [GlobalPartyMediaItem], startIndex: Int = 0) {
        ListeningHistoryTracker.shared.endSession()
        let safeIndex = min(max(0, startIndex), max(0, items.count - 1))
        queue = items
        currentIndex = safeIndex
        currentTime = 0
        duration = currentItem?.duration ?? 0
        isPlaying = true
        syncListeningHistory()
    }

    func play() {
        isPlaying = true
        syncListeningHistory()
    }

    func pause() {
        isPlaying = false
        syncListeningHistory()
    }

    func togglePlayPause() {
        if isPlaying { pause() } else { play() }
    }

    func next(completed: Bool = false) {
        if completed {
            ListeningHistoryTracker.shared.complete()
        } else {
            ListeningHistoryTracker.shared.endSession()
        }
        guard hasNext else { return }
        currentIndex += 1
        currentTime = 0
        duration = currentItem?.duration ?? 0
        isPlaying = true
        syncListeningHistory()
    }

    func previous() {
        if currentTime > 3 {
            currentTime = 0
            return
        }
        guard hasPrevious else { return }
        ListeningHistoryTracker.shared.endSession()
        currentIndex -= 1
        currentTime = 0
        duration = currentItem?.duration ?? 0
        isPlaying = true
        syncListeningHistory()
    }

    func seek(to time: TimeInterval) {
        let safe = min(max(0, time), max(0, duration))
        currentTime = safe
        seekTarget = safe
    }

    /// Called by the playback view to sync time (e.g. from WKWebView).
    func setPlaybackTime(current: TimeInterval, duration: TimeInterval) {
        currentTime = current
        if duration > 0 { self.duration = duration }
        syncListeningHistory()
    }

    /// Called by the playback view when play state changes (e.g. video ended).
    func setPlaying(_ playing: Bool) {
        isPlaying = playing
        syncListeningHistory()
    }

    func clear() {
        ListeningHistoryTracker.shared.endSession()
        queue = []
        currentIndex = 0
        isPlaying = false
        currentTime = 0
        duration = 0
    }

    private func syncListeningHistory() {
        guard let item = currentItem else { return }
        ListeningHistoryTracker.shared.sync(
            mediaId: item.id,
            title: item.title ?? "",
            artist: item.artist ?? "",
            coverArt: item.coverArt ?? "",
            currentTime: currentTime,
            duration: self.duration,
            sourceType: "direct",
            isPlaying: isPlaying
        )
    }
}
