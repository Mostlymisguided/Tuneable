import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        NavigationStack {
            Form {
                if let user = auth.user {
                    Section("Account") {
                        LabeledContent("Username", value: user.username ?? "—")
                        LabeledContent("Email", value: user.email ?? "—")
                        LabeledContent("Balance", value: formatPence(user.balance ?? 0))
                    }
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        auth.logout()
                    }
                }
            }
            .navigationTitle("Profile")
            .refreshable {
                await auth.refreshProfile()
            }
        }
    }

    private func formatPence(_ pence: Double) -> String {
        let pounds = pence / 100
        return pounds >= 1 ? String(format: "£%.2f", pounds) : "\(Int(pence))p"
    }
}

#Preview {
    ProfileView()
        .environmentObject({
            let a = AuthViewModel()
            a.user = User(_id: "1", uuid: "u1", username: "demo", email: "demo@example.com", profilePic: nil, personalInviteCode: nil, balance: 0, role: ["user"], isActive: true, joinedParties: nil, homeLocation: nil, creatorProfile: nil, emailVerified: true, tuneBytes: 0)
            return a
        }())
}
