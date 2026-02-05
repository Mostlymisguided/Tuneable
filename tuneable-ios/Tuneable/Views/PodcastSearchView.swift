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
                    .foregroundStyle(.secondary)
                TextField("Search episodes…", text: $query)
                    .textFieldStyle(.plain)
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(10)
            .background(Color(.systemGray6))
            .cornerRadius(10)
            .padding(.horizontal)

            if hasSearched {
                if isLoading && episodes.isEmpty {
                    Spacer()
                    ProgressView("Searching…")
                    Spacer()
                } else if let msg = errorMessage, episodes.isEmpty {
                    Spacer()
                    ContentUnavailableView {
                        Label("Search failed", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(msg)
                    } actions: {
                        Button("Retry") { Task { await search() } }
                    }
                    Spacer()
                } else if episodes.isEmpty {
                    Spacer()
                    Text("No episodes found. Try a different search.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                    Spacer()
                } else {
                    List {
                        ForEach(episodes) { ep in
                            NavigationLink(value: ep) {
                                EpisodeRow(episode: ep)
                            }
                        }
                        if hasMore {
                            HStack {
                                Spacer()
                                if isLoadingMore {
                                    ProgressView()
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
                }
            } else {
                Spacer()
                Text("Enter at least 2 characters to search podcast episodes.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding()
                Spacer()
            }
        }
        .navigationTitle("Search podcasts")
        .navigationBarTitleDisplayMode(.inline)
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
