import Foundation

/// Fire-and-forget listening-history / play recording against `/users/me/listening-history/track`.
final class ListeningHistoryService {
    static let shared = ListeningHistoryService()
    private let client = APIClient.shared

    struct TrackBody: Encodable {
        let mediaId: String
        let sessionId: String
        let sourceType: String
        let startedAt: String
        let currentTime: Double
        let duration: Double
        let completed: Bool
        let mediaTitle: String
        let mediaArtist: String
        let mediaCoverArt: String
        let client: String
    }

    func track(_ body: TrackBody) {
        Task {
            do {
                _ = try await client.postData("/users/me/listening-history/track", body: body)
            } catch {
                #if DEBUG
                print("[Tuneable] listening history track failed: \(error)")
                #endif
            }
        }
    }
}
