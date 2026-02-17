import SwiftUI

private let globalPartyId = "global"
private let timePeriods: [(key: String, label: String)] = [
    ("all-time", "All Time"),
    ("this-month", "This Month"),
    ("this-week", "This Week"),
    ("today", "Today"),
]

/// Web URL for global party (Add Tunes opens this).
private var globalPartyWebURL: URL? {
    let base = AppConfig.apiBaseURL
    if base.contains("localhost") {
        return URL(string: "http://localhost:3000/party/global")
    }
    return URL(string: base.replacingOccurrences(of: "api.", with: "") + "/party/global")
}

struct MusicView: View {
    @EnvironmentObject private var musicPlayer: MusicPlayerStore
    @State private var media: [GlobalPartyMediaItem] = []
    @State private var selectedPeriod = "today"
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isRefreshing = false
    @State private var selectedTagFilters: Set<String> = []
    @State private var showTagFilterExpanded = false
    @State private var showAllTagsInFilter = false
    @State private var showVetoed = false
    @State private var showAddTunesExpanded = false
    @State private var addTunesSearchQuery = ""
    @State private var showMusicSearch = false

    private let initialTopTagsCount = 6

    /// Display media filtered by selected tags (OR logic); when no tags selected, show all.
    private var displayMedia: [GlobalPartyMediaItem] {
        if selectedTagFilters.isEmpty { return media }
        return media.filter { item in
            let tags = (item.tags ?? []).map { $0.lowercased() }
            return selectedTagFilters.contains(where: { tags.contains($0.lowercased()) })
        }
    }

    private var periodQueueLabel: String {
        switch selectedPeriod {
        case "today": return "Today Queue"
        case "this-week": return "This Week Queue"
        case "this-month": return "This Month Queue"
        case "all-time": return "Tunes"
        default: return "Queue"
        }
    }

    private var totalTipsPence: Int {
        displayMedia.reduce(0) { $0 + (($1.partyMediaAggregate ?? 0)) }
    }

    private var avgTipPence: Double {
        let withTips = displayMedia.filter { ($0.partyMediaAggregate ?? 0) > 0 }
        guard !withTips.isEmpty else { return 0 }
        let total = withTips.reduce(0) { $0 + ($1.partyMediaAggregate ?? 0) }
        return Double(total) / Double(withTips.count)
    }

    /// Top supporters: aggregate bids from displayMedia by user, sorted by total.
    private var topSupporters: [(user: GlobalPartyBidUser, totalPence: Int, count: Int)] {
        var totalByUser: [String: Int] = [:]
        var countByUser: [String: Int] = [:]
        var userByKey: [String: GlobalPartyBidUser] = [:]
        for item in displayMedia {
            for bid in item.bids ?? [] {
                guard let uid = bid.userId,
                      let username = uid.username, !username.isEmpty,
                      let amount = bid.amount, amount > 0 else { continue }
                let key = uid.uuid ?? username
                userByKey[key] = uid
                totalByUser[key, default: 0] += amount
                countByUser[key, default: 0] += 1
            }
        }
        return totalByUser.keys.compactMap { key -> (user: GlobalPartyBidUser, totalPence: Int, count: Int)? in
            guard let user = userByKey[key], let total = totalByUser[key], let count = countByUser[key] else { return nil }
            return (user, total, count)
        }
        .sorted { $0.totalPence > $1.totalPence }
    }

    /// Top tags with total tip amount (pence) for each, sorted by total descending.
    private var topTagsWithAmounts: [(tag: String, totalPence: Int)] {
        var totalByTag: [String: Int] = [:]
        for item in media {
            let amount = item.partyMediaAggregate ?? 0
            for tag in item.tags ?? [] where !tag.isEmpty {
                totalByTag[tag, default: 0] += amount
            }
        }
        return totalByTag.map { ($0.key, $0.value) }
            .sorted { $0.totalPence > $1.totalPence }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                PurpleGradientBackground()
                ScrollView {
                    VStack(spacing: 16) {
                        // 1. Global Tunes header pill
                        Text("Global Tunes")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color(red: 126/255, green: 34/255, blue: 206/255))
                            .clipShape(Capsule())
                            .padding(.top, 8)

                        // 2. Metrics row
                        metricsRow

                        // 3. Top Supporters
                        topSupportersCard

                        // 4. Action buttons + expandable Top Tags
                        VStack(spacing: 12) {
                            addTunesSection
                            filterByTagButton
                            if showTagFilterExpanded {
                                topTagsCard
                            }
                        }
                        .padding(.horizontal, 16)

                        // 5. Period pills
                        periodPicker

                        // 6. Play and Show Vetoed (Show Vetoed hidden for global – API doesn't return vetoed)
                        if !displayMedia.isEmpty {
                            HStack(spacing: 12) {
                                playButton
                            }
                            .padding(.horizontal, 16)
                        }

                        // 7. Track list
                        if isLoading && media.isEmpty {
                            ProgressView("Loading…")
                                .tint(AppTheme.textPrimary)
                                .foregroundStyle(AppTheme.textPrimary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 32)
                        } else if let msg = errorMessage, media.isEmpty {
                            ContentUnavailableView {
                                Label("Couldn't load music", systemImage: "exclamationmark.triangle")
                                    .foregroundStyle(AppTheme.textPrimary)
                            } description: {
                                Text(msg)
                                    .foregroundStyle(AppTheme.textSecondary)
                            } actions: {
                                Button("Retry") { Task { await loadMedia() } }
                            }
                        } else if displayMedia.isEmpty {
                            Text(selectedTagFilters.isEmpty ? "No tunes in this period yet." : "No tunes match the selected tags.")
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.textSecondary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 32)
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(Array(displayMedia.enumerated()), id: \.element.id) { index, item in
                                    let playable = displayMedia.filter { $0.playbackURL != nil }
                                    GlobalPartyMediaRow(index: index + 1, item: item) {
                                        if let idx = playable.firstIndex(where: { $0.id == item.id }) {
                                            musicPlayer.setQueueAndPlay(playable, startIndex: idx)
                                        }
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 24)
                        }
                    }
                }
            }
            .foregroundStyle(AppTheme.textPrimary)
            .navigationTitle("")
.navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .refreshable { await loadMedia() }
            .onAppear { Task { await loadMedia() } }
            .onChange(of: selectedPeriod) { _, _ in Task { await loadMedia() } }
            .sheet(isPresented: $showMusicSearch) {
                MusicSearchView(initialQuery: $addTunesSearchQuery) {
                    Task { await loadMedia() }
                }
            }
        }
    }

    private var metricsRow: some View {
        HStack(spacing: 10) {
            // Queue count
            MetricCard(
                value: "\(displayMedia.count)",
                label: periodQueueLabel,
                icon: "music.note",
                borderColor: AppTheme.accent
            )
            // Total Tips
            MetricCard(
                value: formatPenceAsPounds(totalTipsPence),
                label: "Total Tips",
                icon: "dollarsign.circle",
                borderColor: AppTheme.metricsTotalTipsBorder
            )
            // Avg Tip
            MetricCard(
                value: formatPenceAsPounds(Int(avgTipPence)),
                label: "Avg Tip",
                icon: "chart.line.uptrend.xyaxis",
                borderColor: AppTheme.metricsAvgTipBorder
            )
        }
        .padding(.horizontal, 16)
    }

    private var topSupportersCard: some View {
        Group {
            if topSupporters.isEmpty {
                EmptyView()
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Top Supporters")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.textPrimary)
                    if !selectedTagFilters.isEmpty {
                        Text("Filtered by \(selectedTagFilters.map { "#\($0)" }.joined(separator: ", "))")
                            .font(.caption)
                            .foregroundStyle(AppTheme.textTertiary)
                    }
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 8) {
                            ForEach(Array(topSupporters.prefix(10).enumerated()), id: \.offset) { idx, entry in
                                TopSupportersRow(rank: idx + 1, user: entry.user, totalPence: entry.totalPence, count: entry.count)
                            }
                        }
                    }
                    .frame(maxHeight: 180)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
            }
        }
    }

    private var addTunesSection: some View {
        Group {
            if !showAddTunesExpanded {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showAddTunesExpanded = true
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                        Text("Add Tunes")
                            .font(.subheadline.weight(.medium))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity)
                    .background(Color(red: 126/255, green: 34/255, blue: 206/255))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            } else {
                VStack(spacing: 10) {
                    HStack(spacing: 8) {
                        TextField("Paste a YouTube URL or Search for Tunes…", text: $addTunesSearchQuery)
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Color.white.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .submitLabel(.search)
                            .onSubmit { showMusicSearch = true }
                        Button("Hide") {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showAddTunesExpanded = false
                                addTunesSearchQuery = ""
                            }
                        }
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.textPrimary)
                    }
                    Button {
                        showMusicSearch = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "magnifyingglass")
                            Text("Search")
                                .font(.subheadline.weight(.medium))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity)
                        .background(addTunesSearchQuery.trimmingCharacters(in: .whitespaces).isEmpty ? Color.gray : Color(red: 126/255, green: 34/255, blue: 206/255))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .disabled(addTunesSearchQuery.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private var filterByTagButton: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                showTagFilterExpanded.toggle()
                if !showTagFilterExpanded { showAllTagsInFilter = false }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "tag")
                Text("Filter by Tag")
                    .font(.subheadline.weight(.medium))
            }
            .foregroundStyle(AppTheme.textPrimary)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var topTagsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "tag")
                        .foregroundStyle(AppTheme.textPrimary)
                    Text("Top Tags")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.textPrimary)
                }
                Spacer()
                Button("Hide") {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showTagFilterExpanded = false
                        showAllTagsInFilter = false
                    }
                }
                .font(.subheadline)
                .foregroundStyle(AppTheme.textPrimary)
            }

            let tagsToShow = showAllTagsInFilter ? topTagsWithAmounts : Array(topTagsWithAmounts.prefix(initialTopTagsCount))
            let remainingCount = topTagsWithAmounts.count - initialTopTagsCount

            FlowLayout(spacing: 8) {
                ForEach(tagsToShow, id: \.tag) { entry in
                    let isSelected = selectedTagFilters.contains(entry.tag)
                    Button {
                        if selectedTagFilters.contains(entry.tag) {
                            selectedTagFilters.remove(entry.tag)
                        } else {
                            selectedTagFilters.insert(entry.tag)
                        }
                    } label: {
                        VStack(spacing: 2) {
                            Text("#\(entry.tag)")
                                .font(.caption.weight(.medium))
                                .lineLimit(1)
                            Text(formatPenceAsPounds(entry.totalPence))
                                .font(.caption2)
                                .foregroundStyle(AppTheme.textTertiary)
                        }
                        .foregroundStyle(AppTheme.textPrimary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(isSelected ? Color(red: 126/255, green: 34/255, blue: 206/255).opacity(0.6) : Color.white.opacity(0.12))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            if !showAllTagsInFilter && remainingCount > 0 {
                HStack {
                    Spacer(minLength: 0)
                    Button {
                        showAllTagsInFilter = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                                .font(.caption.weight(.medium))
                            Text("Show More")
                                .font(.caption.weight(.medium))
                        }
                        .foregroundStyle(AppTheme.textPrimary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.12))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var periodPicker: some View {
        HStack(spacing: 6) {
            ForEach(timePeriods, id: \.key) { period in
                Button {
                    selectedPeriod = period.key
                } label: {
                    Text(period.label)
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(selectedPeriod == period.key ? Color(red: 126/255, green: 34/255, blue: 206/255) : Color.white.opacity(0.12))
                        .foregroundStyle(selectedPeriod == period.key ? .white : AppTheme.textSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    /// Play the displayed queue: opens the first track’s playback URL (e.g. YouTube) in the system.
    /// Mirrors web Party “Play” behavior (queue = displayMedia); iOS has no in-app music queue player yet.
    private var playButton: some View {
        Button {
            playDisplayedQueue()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "play.fill")
                    .font(.body)
                Text("Play")
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color(red: 126/255, green: 34/255, blue: 206/255)))
        }
        .buttonStyle(.plain)
    }

    /// Play the queue displayed below (same logic as web: use current time filter + tag filter).
    /// Uses in-app music player (queue + WKWebView for YouTube / direct audio).
    private func playDisplayedQueue() {
        let queue = displayMedia
        guard !queue.isEmpty else { return }
        let playable = queue.filter { $0.playbackURL != nil }
        guard !playable.isEmpty else { return }
        musicPlayer.setQueueAndPlay(playable, startIndex: 0)
    }

    private func formatPenceAsPounds(_ pence: Int) -> String {
        if pence >= 100 {
            return String(format: "£%.2f", Double(pence) / 100)
        }
        return "\(pence)p"
    }

    private func loadMedia() async {
        if media.isEmpty && !isRefreshing { isLoading = true }
        isRefreshing = true
        errorMessage = nil
        do {
            media = try await PartyService.shared.getMediaSortedByTime(partyId: globalPartyId, timePeriod: selectedPeriod)
        } catch {
            errorMessage = error.localizedDescription
            media = []
        }
        isLoading = false
        isRefreshing = false
    }
}

// MARK: - Flow layout (wraps subviews by content width, no fixed columns)
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width + spacing > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width - bounds.minX > maxWidth && x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
    }
}

// MARK: - Metric card
struct MetricCard: View {
    let value: String
    let label: String
    let icon: String
    let borderColor: Color

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(borderColor)
                Spacer()
            }
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(AppTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundStyle(AppTheme.textSecondary)
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(AppTheme.cardBackground)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(borderColor.opacity(0.6), lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Top supporters row
struct TopSupportersRow: View {
    let rank: Int
    let user: GlobalPartyBidUser
    let totalPence: Int
    let count: Int

    private var totalFormatted: String {
        if totalPence >= 100 { return String(format: "£%.2f", Double(totalPence) / 100) }
        return "\(totalPence)p"
    }

    private var avgFormatted: String {
        guard count > 0 else { return "—" }
        let avg = totalPence / count
        if avg >= 100 { return String(format: "£%.2f", Double(avg) / 100) }
        return "\(avg)p"
    }

    private var avatarURL: URL? {
        guard let s = user.profilePic, !s.isEmpty else { return nil }
        return URL(string: s)
    }

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 126/255, green: 34/255, blue: 206/255), Color(red: 219/255, green: 39/255, blue: 119/255)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 28, height: 28)
                Text("#\(rank)")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
            }
            if let url = avatarURL {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        Circle().fill(Color.white.opacity(0.2))
                    }
                }
                .frame(width: 36, height: 36)
                .clipShape(Circle())
            } else {
                Circle()
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 36, height: 36)
                    .overlay(Text(String((user.username ?? "?").prefix(1))).font(.caption).foregroundStyle(AppTheme.textSecondary))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(user.username ?? "Unknown")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(AppTheme.textPrimary)
                Text("\(count) Tip\(count == 1 ? "" : "s")")
                    .font(.caption2)
                    .foregroundStyle(AppTheme.textTertiary)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 2) {
                Text(totalFormatted)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(AppTheme.metricsAvgTipBorder)
                HStack(spacing: 2) {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.caption2)
                    Text(avgFormatted)
                        .font(.caption2)
                }
                .foregroundStyle(AppTheme.textTertiary)
            }
        }
        .padding(8)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Track row (redesigned)
struct GlobalPartyMediaRow: View {
    let index: Int
    let item: GlobalPartyMediaItem
    var onPlay: (() -> Void)? = nil

    private var coverArtURL: URL? {
        guard let urlString = item.coverArt, !urlString.isEmpty else { return nil }
        return URL(string: urlString)
    }

    private var tipTotalFormatted: String {
        let pence = Double(item.partyMediaAggregate ?? 0)
        if pence >= 100 { return String(format: "£%.2f", pence / 100) }
        return "\(Int(pence))p"
    }

    private var avgTipFormatted: String {
        let bids = item.bids ?? []
        let total = bids.reduce(0) { $0 + ($1.amount ?? 0) }
        let count = max(bids.count, 1)
        let avg = total / count
        if avg >= 100 { return String(format: "£%.2f", Double(avg) / 100) }
        return count > 0 ? "\(avg)p" : "—"
    }

    private var durationFormatted: String {
        guard let secs = item.duration, secs > 0 else { return "—" }
        let m = Int(secs) / 60
        let s = Int(secs) % 60
        return String(format: "%d:%02d", m, s)
    }

    /// Supporters aggregated by user from item.bids (for mini bar).
    private var supportersForBar: [(user: GlobalPartyBidUser, totalPence: Int)] {
        var byUser: [String: (user: GlobalPartyBidUser, total: Int)] = [:]
        for bid in item.bids ?? [] {
            guard let uid = bid.userId, let name = uid.username, !name.isEmpty, let amt = bid.amount, amt > 0 else { continue }
            let key = uid.uuid ?? name
            if byUser[key] == nil { byUser[key] = (uid, 0) }
            byUser[key]?.total += amt
        }
        return byUser.values.map { (user: $0.user, totalPence: $0.total) }.sorted { $0.totalPence > $1.totalPence }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Left: artwork + play overlay + two metrics under
            VStack(alignment: .leading, spacing: 6) {
                ZStack(alignment: .center) {
                    Group {
                        if let url = coverArtURL {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .success(let image):
                                    image.resizable().aspectRatio(contentMode: .fill)
                                case .failure, .empty:
                                    Rectangle()
                                        .fill(Color.white.opacity(0.1))
                                        .overlay { ProgressView().tint(AppTheme.textSecondary) }
                                @unknown default:
                                    Rectangle().fill(Color.white.opacity(0.1))
                                }
                            }
                        } else {
                            Rectangle()
                                .fill(Color.white.opacity(0.1))
                                .overlay { Image(systemName: "music.note").font(.title2).foregroundStyle(AppTheme.textTertiary) }
                        }
                    }
                    .frame(width: 88, height: 88)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    // Play overlay
                    Button {
                        onPlay?()
                    } label: {
                        Circle()
                            .fill(Color.black.opacity(0.35))
                            .frame(width: 44, height: 44)
                            .overlay(
                                Image(systemName: "play.fill")
                                    .font(.title2)
                                    .foregroundStyle(.white)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(onPlay == nil)
                }
                HStack(spacing: 10) {
                    HStack(spacing: 4) {
                        Image(systemName: "dollarsign.circle")
                            .font(.caption2)
                        Text(tipTotalFormatted)
                            .font(.caption2)
                    }
                    .foregroundStyle(AppTheme.textTertiary)
                    HStack(spacing: 4) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.caption2)
                        Text(avgTipFormatted)
                            .font(.caption2)
                    }
                    .foregroundStyle(AppTheme.textTertiary)
                }
            }

            // Right: queue #, title, artist, duration, supporters bar, tags
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 126/255, green: 34/255, blue: 206/255), Color(red: 219/255, green: 39/255, blue: 119/255)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 28, height: 28)
                        Text("\(index)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    Spacer(minLength: 4)
                }
                Text(item.title ?? "Unknown")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(AppTheme.textPrimary)
                    .lineLimit(2)
                Text(item.artist ?? "Unknown Artist")
                    .font(.caption)
                    .foregroundStyle(AppTheme.textSecondary)
                    .lineLimit(1)
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption2)
                    Text(durationFormatted)
                        .font(.caption2)
                }
                .foregroundStyle(AppTheme.textTertiary)

                if !supportersForBar.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Array(supportersForBar.prefix(5).enumerated()), id: \.offset) { _, entry in
                                HStack(spacing: 4) {
                                    if let urlString = entry.user.profilePic, !urlString.isEmpty, let url = URL(string: urlString) {
                                        AsyncImage(url: url) { p in
                                            if case .success(let img) = p { img.resizable().aspectRatio(contentMode: .fill) }
                                            else { Circle().fill(Color.white.opacity(0.2)) }
                                        }
                                        .frame(width: 20, height: 20)
                                        .clipShape(Circle())
                                    } else {
                                        Circle()
                                            .fill(Color.white.opacity(0.2))
                                            .frame(width: 20, height: 20)
                                    }
                                    Text(entry.user.username ?? "")
                                        .font(.caption2)
                                        .foregroundStyle(AppTheme.textSecondary)
                                    Text(entry.totalPence >= 100 ? String(format: "£%.2f", Double(entry.totalPence) / 100) : "\(entry.totalPence)p")
                                        .font(.caption2)
                                        .foregroundStyle(AppTheme.metricsAvgTipBorder)
                                }
                                .padding(.horizontal, 6)
                                .padding(.vertical, 4)
                                .background(Color.white.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                            }
                        }
                    }
                }

                if let tags = item.tags, !tags.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(tags.prefix(5), id: \.self) { tag in
                                Text("#\(tag)")
                                    .font(.caption2)
                                    .foregroundStyle(AppTheme.textPrimary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(red: 126/255, green: 34/255, blue: 206/255).opacity(0.5))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(AppTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview("Music") {
    MusicView()
        .environmentObject(MusicPlayerStore())
}
