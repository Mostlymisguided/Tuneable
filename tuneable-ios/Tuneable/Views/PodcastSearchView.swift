import SwiftUI

struct PodcastSearchView: View {
    @State private var query = ""
    @State private var episodes: [PodcastEpisode] = []
    @State private var isLoading = false
    @State private var isLoadingMore = false
    @State private var hasMore = false
    @State private var offset = 0
    @State private var errorMessage: String?
    @State private var hasSearched = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(AppTheme.textSecondary)
                TextField("Search episodes…", text: $query)
                    .textFieldStyle(.plain)
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
                    .foregroundStyle(AppTheme.textPrimary)
                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AppTheme.textSecondary)
                    }
                }
            }
            .padding(10)
            .background(AppTheme.cardBackground)
            .cornerRadius(10)
            .padding(.horizontal)

            if hasSearched {
                if isLoading && episodes.isEmpty {
                    Spacer()
                    ProgressView("Searching…")
                        .tint(AppTheme.textPrimary)
                        .foregroundStyle(AppTheme.textPrimary)
                    Spacer()
                } else if let msg = errorMessage, episodes.isEmpty {
                    Spacer()
                    ContentUnavailableView {
                        Label("Search failed", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(AppTheme.textPrimary)
                    } description: {
                        Text(msg)
                            .foregroundStyle(AppTheme.textSecondary)
                    } actions: {
                        Button("Retry") { Task { await search() } }
                    }
                    Spacer()
                } else if episodes.isEmpty {
                    Spacer()
                    Text("No episodes found. Try a different search.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding()
                    Spacer()
                } else {
                    List {
                        ForEach(episodes) { ep in
                            NavigationLink(value: ep) {
                                EpisodeRow(episode: ep)
                            }
                            .listRowBackground(AppTheme.cardBackground)
                            .listRowSeparatorTint(AppTheme.cardBorder)
                        }
                        if hasMore {
                            HStack {
                                Spacer()
                                if isLoadingMore {
                                    ProgressView()
                                        .tint(AppTheme.textPrimary)
                                } else {
                                    Button("Load more") {
                                        Task { await loadMore() }
                                    }
                                }
                                Spacer()
                            }
                            .listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            } else {
                Spacer()
                Text("Enter at least 2 characters to search podcast episodes.")
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding()
                Spacer()
            }
        }
        .background(PurpleGradientBackground())
        .foregroundStyle(AppTheme.textPrimary)
        .navigationTitle("Search podcasts")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return }
        hasSearched = true
        isLoading = true
        errorMessage = nil
        offset = 0
        do {
            let (list, more) = try await PodcastService.shared.searchEpisodes(q: q, limit: 50, offset: 0)
            episodes = list
            hasMore = more
            offset = list.count
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func loadMore() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2, !isLoadingMore else { return }
        isLoadingMore = true
        do {
            let (list, more) = try await PodcastService.shared.searchEpisodes(q: q, limit: 50, offset: offset)
            episodes.append(contentsOf: list)
            hasMore = more
            offset = episodes.count
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoadingMore = false
    }
}

#Preview {
    NavigationStack {
        PodcastSearchView()
    }
}
