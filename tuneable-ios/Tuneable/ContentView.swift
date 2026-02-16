import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        Group {
            if auth.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: auth.isLoggedIn)
    }
}

struct MainTabView: View {
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var podcastPlayer: PodcastPlayerStore
    @State private var showNowPlaying = false

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            PodcastsChartView()
                .tabItem { Label("Podcasts", systemImage: "mic.fill") }
            MusicView()
                .tabItem { Label("Music", systemImage: "music.note") }
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.fill") }
        }
        .tint(AppTheme.accent)
        .onAppear {
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(red: 26/255, green: 26/255, blue: 46/255, alpha: 1)
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
        .overlay(alignment: .bottom) {
            PodcastMiniBarView(showNowPlaying: $showNowPlaying)
                .padding(.bottom, 49) // Tab bar height so mini bar sits above it
        }
        .fullScreenCover(isPresented: $showNowPlaying) {
            NowPlayingSheet()
                .environmentObject(podcastPlayer)
        }
    }
}

#Preview("Logged out") {
    ContentView()
        .environmentObject(AuthViewModel())
}

#Preview("Logged in") {
    ContentView()
        .environmentObject({
            let a = AuthViewModel()
            a.user = User(_id: "1", uuid: "u1", username: "demo", email: "demo@example.com", profilePic: nil, personalInviteCode: nil, balance: 0, role: ["user"], isActive: true, joinedParties: nil, homeLocation: nil, creatorProfile: nil, emailVerified: true, tuneBytes: 0)
            return a
        }())
}
