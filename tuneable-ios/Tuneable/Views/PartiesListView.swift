import SwiftUI

struct PartiesListView: View {
    @State private var parties: [Party] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var partyCode = ""
    @State private var showCodeSheet = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && parties.isEmpty {
                    ProgressView("Loading parties…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let msg = errorMessage, parties.isEmpty {
                    ContentUnavailableView {
                        Label("Couldn't load parties", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(msg)
                    } actions: {
                        Button("Retry") { Task { await loadParties() } }
                    }
                } else {
                    List(parties) { party in
                        NavigationLink(value: party) {
                            PartyRow(party: party)
                        }
                    }
                }
            }
            .navigationTitle("Parties")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Join by code") { showCodeSheet = true }
                }
            }
            .refreshable { await loadParties() }
            .onAppear { Task { await loadParties() } }
            .sheet(isPresented: $showCodeSheet) {
                JoinPartyByCodeSheet(code: $partyCode, onJoin: {
                    showCodeSheet = false
                    Task { await loadParties() }
                })
            }
            .navigationDestination(for: Party.self) { party in
                PartyDetailView(party: party)
            }
        }
    }

    private func loadParties() async {
        isLoading = true
        errorMessage = nil
        do {
            parties = try await PartyService.shared.getParties()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct PartyRow: View {
    let party: Party

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(party.name)
                .font(.headline)
            Text(party.location)
                .font(.caption)
                .foregroundStyle(.secondary)
            if let status = party.status {
                Text(status.capitalized)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 2)
    }
}

struct JoinPartyByCodeSheet: View {
    @Binding var code: String
    var onJoin: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Party code", text: $code)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                if let e = error {
                    Text(e)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
                Section {
                    Button("Join") {
                        Task { await join() }
                    }
                    .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || loading)
                }
            }
            .navigationTitle("Join by code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func join() async {
        let c = code.trimmingCharacters(in: .whitespaces)
        guard !c.isEmpty else { return }
        loading = true
        error = nil
        do {
            let party = try await PartyService.shared.searchByCode(c)
            try await PartyService.shared.joinParty(partyId: party.id, inviteCode: nil)
            onJoin()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

struct PartyDetailView: View {
    let party: Party

    var body: some View {
        List {
            Section("Info") {
                LabeledContent("Name", value: party.name)
                LabeledContent("Location", value: party.location)
                LabeledContent("Code", value: party.partyCode)
                if let status = party.status {
                    LabeledContent("Status", value: status)
                }
            }
            if let media = party.media, !media.isEmpty {
                Section("Queue (\(media.count))") {
                    ForEach(media.prefix(20)) { item in
                        Text(item.title ?? "Untitled")
                            .font(.subheadline)
                    }
                    if media.count > 20 {
                        Text("+ \(media.count - 20) more")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(party.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Parties list") {
    PartiesListView()
}
