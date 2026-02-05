import SwiftUI

struct PodcastEpisodeProfileView: View {
    let episodeId: String
    @State private var episode: PodcastEpisode?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showTipSheet = false
    @State private var tipAmountPounds: Double = 0.11
    @State private var isPlacingBid = false
    @State private var tipError: String?
    @State private var tipSuccess = false
    @EnvironmentObject private var podcastPlayer: PodcastPlayerStore
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        Group {
            if isLoading && episode == nil {
                ProgressView("Loading episode…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let msg = errorMessage, episode == nil {
                ContentUnavailableView {
                    Label("Couldn't load episode", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(msg)
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else if let ep = episode {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let url = ep.coverArt.flatMap({ URL(string: $0) })
                            ?? ep.podcastSeries?.coverArt.flatMap({ URL(string: $0) })
                            ?? URL(string: AppConfig.defaultCoverArtURL) {
                            AsyncImage(url: url) { ph in
                                ph.resizable().scaledToFill()
                            } placeholder: {
                                Rectangle().fill(.gray.opacity(0.3))
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 220)
                            .clipped()
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text(ep.title ?? "Untitled")
                                .font(.title2)
                            Text(ep.podcastSeries?.title ?? ep.podcastTitle ?? "")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            if let agg = ep.globalMediaAggregate, agg > 0 {
                                Text("Tips: \(formatPence(agg))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let dur = ep.duration, dur > 0 {
                                Text(durationString(dur))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal)

                        HStack(spacing: 12) {
                            Button {
                                podcastPlayer.setEpisode(ep)
                                podcastPlayer.play()
                            } label: {
                                Label("Play", systemImage: "play.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(ep.audioURL == nil)

                            Button {
                                showTipSheet = true
                            } label: {
                                Label("Tip", systemImage: "heart.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                        .padding(.horizontal)

                        if let desc = ep.description, !desc.isEmpty {
                            Text(desc.strippingHTML)
                                .font(.body)
                                .padding(.horizontal)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .sheet(isPresented: $showTipSheet) {
                    tipSheet(ep: ep)
                }
            }
        }
        .navigationTitle(episode?.title ?? "Episode")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .onAppear { Task { await load() } }
    }

    private func tipSheet(ep: PodcastEpisode) -> some View {
        NavigationStack {
            Form {
                if tipSuccess {
                    Section {
                        Label("Tip placed!", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                } else {
                    Section("Your tip amount") {
                        HStack(spacing: 12) {
                            Button {
                                adjustTipAmount(by: -0.01)
                            } label: {
                                Image(systemName: "minus.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(tipAmountPounds <= 0.01 ? Color.gray : Color.accentColor)
                            }
                            .disabled(tipAmountPounds <= 0.01 || isPlacingBid)

                            TextField("0.00", value: $tipAmountPounds, format: .currency(code: "GBP"))
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.center)

                            Button {
                                adjustTipAmount(by: 0.01)
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(Color.accentColor)
                            }
                            .disabled(isPlacingBid)
                        }
                        .padding(.vertical, 4)
                    }
                    if let err = tipError {
                        Section {
                            Text(err)
                                .foregroundStyle(.red)
                        }
                    }
                    Section {
                        Button("Place tip") {
                            Task { await placeTip(ep: ep) }
                        }
                        .disabled(tipAmountPounds < 0.01 || isPlacingBid)
                    }
                }
            }
            .navigationTitle("Tip episode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tipSuccess ? "Done" : "Cancel") {
                        showTipSheet = false
                        if tipSuccess { tipSuccess = false }
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func adjustTipAmount(by delta: Double) {
        let newAmount = (tipAmountPounds + delta)
        tipAmountPounds = max(0.01, (round(newAmount * 100) / 100))
    }

    private func placeTip(ep: PodcastEpisode) async {
        isPlacingBid = true
        tipError = nil
        tipSuccess = false
        let amountPence = Int(round(tipAmountPounds * 100))
        do {
            try await PodcastService.shared.placeGlobalBid(mediaId: ep.id, amountPence: amountPence)
            tipSuccess = true
            await auth.refreshProfile()
            await load()
        } catch let err as APIError where err.isUnauthorized {
            auth.logout()
            showTipSheet = false
        } catch {
            tipError = error.localizedDescription
        }
        isPlacingBid = false
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            episode = try await PodcastService.shared.getMediaProfile(mediaId: episodeId)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private func formatPence(_ pence: Double) -> String {
    let safe = pence.isFinite && !pence.isNaN ? pence : 0
    let pounds = safe / 100
    return String(format: "£%.2f", pounds)
}

private func durationString(_ seconds: Double) -> String {
    let safe = seconds.isFinite && !seconds.isNaN && seconds >= 0 ? seconds : 0
    let m = Int(safe) / 60
    let s = Int(safe) % 60
    return String(format: "%d:%02d", m, s)
}

#Preview {
    NavigationStack {
        PodcastEpisodeProfileView(episodeId: "test")
            .environmentObject(PodcastPlayerStore())
            .environmentObject(AuthViewModel())
    }
}
