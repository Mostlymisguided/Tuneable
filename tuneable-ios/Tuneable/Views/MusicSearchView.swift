import SwiftUI

/// In-app search for Global Tunes: Tuneable DB + YouTube, with Add & Tip (same behavior as web Party search).
struct MusicSearchView: View {
    static let globalPartyId = "global"
    @Environment(\.dismiss) private var dismiss

    @Binding var initialQuery: String
    var onAdded: (() -> Void)?

    @State private var query: String = ""
    @State private var databaseResults: [SearchResultItem] = []
    @State private var youtubeResults: [SearchResultItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var hasSearched = false
    @State private var bidAmounts: [String: String] = [:]
    @State private var addingId: String?
    @State private var showLoginMessage = false

    private var allResults: [SearchResultItem] { databaseResults + youtubeResults }

    var body: some View {
        NavigationStack {
            ZStack {
                PurpleGradientBackground()
                VStack(spacing: 16) {
                    searchBar
                    if hasSearched {
                        if isLoading && allResults.isEmpty {
                            Spacer()
                            ProgressView("Searching…")
                                .tint(AppTheme.textPrimary)
                                .foregroundStyle(AppTheme.textPrimary)
                            Spacer()
                        } else if let msg = errorMessage, allResults.isEmpty {
                            Spacer()
                            ContentUnavailableView {
                                Label("Search failed", systemImage: "exclamationmark.triangle")
                                    .foregroundStyle(AppTheme.textPrimary)
                            } description: {
                                Text(msg)
                                    .foregroundStyle(AppTheme.textSecondary)
                            } actions: {
                                Button("Retry") { Task { await performSearch() } }
                            }
                            Spacer()
                        } else if allResults.isEmpty {
                            Spacer()
                            Text("No tunes found for \"\(query)\".")
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.textSecondary)
                                .multilineTextAlignment(.center)
                                .padding()
                            Spacer()
                        } else {
                            resultsList
                        }
                    } else {
                        Spacer()
                        Text("Search the Tuneable library and YouTube, then add a tune with a tip.")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                        Spacer()
                    }
                }
                .padding(.top, 8)
            }
            .foregroundStyle(AppTheme.textPrimary)
            .navigationTitle("Add Tunes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(AppTheme.textPrimary)
                }
            }
            .onAppear {
                if !initialQuery.isEmpty {
                    query = initialQuery
                }
            }
            .alert("Sign in to tip", isPresented: $showLoginMessage) {
                Button("OK", role: .cancel) { }
            } message: {
                Text("You need to sign in to add a tune and place a tip.")
            }
        }
    }

    private var searchBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                TextField("Paste a YouTube URL or search…", text: $query)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.textPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .submitLabel(.search)
                    .onSubmit { Task { await performSearch() } }
                Button("Search") {
                    Task { await performSearch() }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(query.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : Color(red: 126/255, green: 34/255, blue: 206/255))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty || isLoading)
            }
            .padding(.horizontal, 16)
        }
    }

    private var resultsList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !databaseResults.isEmpty {
                    sectionHeader("From Tuneable Library", count: databaseResults.count)
                    ForEach(databaseResults) { item in
                        searchResultRow(item, isFromDatabase: true)
                    }
                }
                if !youtubeResults.isEmpty {
                    sectionHeader("From YouTube", count: youtubeResults.count)
                    ForEach(youtubeResults) { item in
                        searchResultRow(item, isFromDatabase: false)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        Text("\(title) (\(count))")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.textPrimary)
    }

    private func searchResultRow(_ item: SearchResultItem, isFromDatabase: Bool) -> some View {
        let key = item.id
        let bidText = Binding(
            get: { bidAmounts[key] ?? "1.00" },
            set: { bidAmounts[key] = $0 }
        )
        let isAdding = addingId == key

        return HStack(alignment: .top, spacing: 12) {
            coverArt(url: item.coverArt)
            VStack(alignment: .leading, spacing: 6) {
                Text(item.title ?? "Unknown")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.textPrimary)
                    .lineLimit(2)
                Text(item.artist ?? "Unknown Artist")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textTertiary)
                if let secs = item.duration, secs > 0 {
                    Text(formatDuration(secs))
                        .font(.caption2)
                        .foregroundStyle(AppTheme.textTertiary)
                }
                HStack(spacing: 8) {
                    Text("£")
                        .font(.caption)
                        .foregroundStyle(AppTheme.textSecondary)
                    TextField("1.00", text: bidText)
                        .keyboardType(.decimalPad)
                        .font(.caption)
                        .foregroundStyle(AppTheme.textPrimary)
                        .frame(width: 56)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    Button {
                        Task { await addAndTip(item: item, bidText: bidText.wrappedValue) }
                    } label: {
                        if isAdding {
                            ProgressView()
                                .scaleEffect(0.8)
                                .tint(.white)
                        } else {
                            Text("Add & Tip")
                                .font(.caption.weight(.medium))
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(red: 126/255, green: 34/255, blue: 206/255))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .disabled(isAdding)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func coverArt(url: String?) -> some View {
        Group {
            if let s = url, !s.isEmpty, let u = URL(string: s) {
                AsyncImage(url: u) { phase in
                    switch phase {
                    case .success(let img): img.resizable().aspectRatio(contentMode: .fill)
                    default: Rectangle().fill(Color.white.opacity(0.1))
                    }
                }
            } else {
                Rectangle()
                    .fill(Color.white.opacity(0.1))
                    .overlay { Image(systemName: "music.note").foregroundStyle(AppTheme.textTertiary) }
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func formatDuration(_ seconds: Double) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }

    private func performSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        hasSearched = true
        isLoading = true
        errorMessage = nil
        databaseResults = []
        youtubeResults = []
        bidAmounts = [:]

        defer { isLoading = false }

        do {
            if isYouTubeUrl(q) {
                let response = try await SearchService.shared.searchByYouTubeUrl(q)
                if response.source == "local", let v = response.videos {
                    databaseResults = v
                } else if response.source == "external", let v = response.videos {
                    youtubeResults = v
                }
            } else {
                let response = try await SearchService.shared.search(query: q, source: "youtube")
                if response.source == "local", let v = response.videos {
                    databaseResults = v
                } else if response.source == "external", let v = response.videos {
                    youtubeResults = v
                }
                if response.hasMoreExternal == true {
                    let ext = try await SearchService.shared.search(query: q, source: "youtube", forceExternal: true)
                    if let v = ext.videos {
                        youtubeResults = v
                    }
                }
            }
            for item in allResults {
                if bidAmounts[item.id] == nil {
                    bidAmounts[item.id] = "1.00"
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func addAndTip(item: SearchResultItem, bidText: String) async {
        guard AuthService.shared.isLoggedIn else {
            showLoginMessage = true
            return
        }
        guard let url = item.url else {
            errorMessage = "No URL for this tune"
            return
        }
        let bidPounds = Double(bidText.replacingOccurrences(of: ",", with: ".")) ?? 1.0
        guard bidPounds >= 0.01 else {
            errorMessage = "Tip must be at least £0.01"
            return
        }

        addingId = item.id
        defer { addingId = nil }

        do {
            let body = AddMediaBody(
                url: url,
                title: item.title ?? "Unknown",
                artist: item.artist ?? "Unknown Artist",
                bidAmount: bidPounds,
                platform: item.platform,
                duration: item.duration,
                coverArt: item.coverArt,
                category: item.category ?? "Music",
                tags: item.tags
            )
            _ = try await PartyService.shared.addMediaToParty(partyId: Self.globalPartyId, body: body)
            onAdded?()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func isYouTubeUrl(_ s: String) -> Bool {
        let lower = s.lowercased()
        return lower.contains("youtube.com") || lower.contains("youtu.be")
    }
}
