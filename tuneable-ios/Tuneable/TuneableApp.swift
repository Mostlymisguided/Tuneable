import SwiftUI

@main
struct TuneableApp: App {
    @StateObject private var auth = AuthViewModel()
    @StateObject private var podcastPlayer = PodcastPlayerStore()
    @StateObject private var musicPlayer = MusicPlayerStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .environmentObject(podcastPlayer)
                .environmentObject(musicPlayer)
                .preferredColorScheme(.dark)
                .tint(AppTheme.accent)
        }
    }
}
