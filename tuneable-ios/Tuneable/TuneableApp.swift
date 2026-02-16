import SwiftUI

@main
struct TuneableApp: App {
    @StateObject private var auth = AuthViewModel()
    @StateObject private var podcastPlayer = PodcastPlayerStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .environmentObject(podcastPlayer)
                .preferredColorScheme(.dark)
                .tint(AppTheme.accent)
        }
    }
}
