import Foundation
import UIKit

/// Client-side session + heartbeat for qualified play recording.
@MainActor
final class ListeningHistoryTracker {
    static let shared = ListeningHistoryTracker()

    private struct Session {
        let sessionId: String
        let startedAt: String
        let mediaId: String
        var title: String
        var artist: String
        var coverArt: String
        var sourceType: String
        var lastPosition: TimeInterval
        var lastDuration: TimeInterval
    }

    private var session: Session?
    private var lastIsPlaying = false
    private var heartbeat: Timer?
    private var backgroundObserver: NSObjectProtocol?

    private init() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.flush(completed: false)
            }
        }
    }

    func sync(
        mediaId: String?,
        title: String,
        artist: String,
        coverArt: String,
        currentTime: TimeInterval,
        duration: TimeInterval,
        sourceType: String = "direct",
        isPlaying: Bool
    ) {
        guard AuthService.shared.isLoggedIn, let mediaId, !mediaId.isEmpty else {
            endSession()
            return
        }

        if let current = session, current.mediaId != mediaId {
            flush(completed: false)
            session = nil
            lastIsPlaying = false
            stopHeartbeat()
        }

        let playingBecameTrue = isPlaying && !lastIsPlaying
        let playingBecameFalse = !isPlaying && lastIsPlaying
        lastIsPlaying = isPlaying

        if isPlaying {
            let startedNew = session == nil || session?.mediaId != mediaId
            ensureSession(
                mediaId: mediaId,
                title: title,
                artist: artist,
                coverArt: coverArt,
                currentTime: currentTime,
                duration: duration,
                sourceType: sourceType
            )
            applyProgress(currentTime: currentTime, duration: duration, title: title, artist: artist, coverArt: coverArt)
            if startedNew || playingBecameTrue {
                flush(completed: false)
                startHeartbeat()
            }
        } else if playingBecameFalse {
            applyProgress(currentTime: currentTime, duration: duration, title: title, artist: artist, coverArt: coverArt)
            flush(completed: false)
            stopHeartbeat()
        } else {
            applyProgress(currentTime: currentTime, duration: duration, title: title, artist: artist, coverArt: coverArt)
        }
    }

    func complete() {
        flush(completed: true)
        session = nil
        lastIsPlaying = false
        stopHeartbeat()
    }

    func endSession() {
        flush(completed: false)
        session = nil
        lastIsPlaying = false
        stopHeartbeat()
    }

    private func ensureSession(
        mediaId: String,
        title: String,
        artist: String,
        coverArt: String,
        currentTime: TimeInterval,
        duration: TimeInterval,
        sourceType: String
    ) {
        if session == nil || session?.mediaId != mediaId {
            session = Session(
                sessionId: "\(mediaId):\(Int(Date().timeIntervalSince1970 * 1000)):\(UUID().uuidString.prefix(8))",
                startedAt: ISO8601DateFormatter().string(from: Date()),
                mediaId: mediaId,
                title: title,
                artist: artist,
                coverArt: coverArt,
                sourceType: sourceType,
                lastPosition: currentTime,
                lastDuration: duration
            )
        }
    }

    private func applyProgress(
        currentTime: TimeInterval,
        duration: TimeInterval,
        title: String,
        artist: String,
        coverArt: String
    ) {
        guard session != nil else { return }
        session?.lastPosition = currentTime
        session?.lastDuration = duration
        if !title.isEmpty { session?.title = title }
        if !artist.isEmpty { session?.artist = artist }
        if !coverArt.isEmpty { session?.coverArt = coverArt }
    }

    private func flush(completed: Bool) {
        guard let session, AuthService.shared.isLoggedIn else { return }
        ListeningHistoryService.shared.track(.init(
            mediaId: session.mediaId,
            sessionId: session.sessionId,
            sourceType: session.sourceType,
            startedAt: session.startedAt,
            currentTime: session.lastPosition,
            duration: session.lastDuration,
            completed: completed,
            mediaTitle: session.title,
            mediaArtist: session.artist,
            mediaCoverArt: session.coverArt,
            client: "ios"
        ))
    }

    private func startHeartbeat() {
        stopHeartbeat()
        let timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.lastIsPlaying else { return }
                self.flush(completed: false)
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        heartbeat = timer
    }

    private func stopHeartbeat() {
        heartbeat?.invalidate()
        heartbeat = nil
    }
}
