import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let user = auth.user {
                        Text("Hello, \(user.username ?? "User")")
                            .font(.title2)
                            .foregroundStyle(AppTheme.textPrimary)
                            .padding(.horizontal)
                        Text("Balance: \(formatPence(user.balance ?? 0))")
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.textSecondary)
                            .padding(.horizontal)
                    }
                    Text("Join or create parties to curate music together.")
                        .font(.body)
                        .foregroundStyle(AppTheme.textSecondary)
                        .padding()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
            }
            .purpleGradientBackground()
            .navigationTitle("Home")
            .toolbarColorScheme(.dark, for: .navigationBar)
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
    HomeView()
        .environmentObject({
            let a = AuthViewModel()
            a.user = User(_id: "1", uuid: "u1", username: "demo", email: "demo@example.com", profilePic: nil, personalInviteCode: nil, balance: 1100, role: ["user"], isActive: true, joinedParties: nil, homeLocation: nil, creatorProfile: nil, emailVerified: true, tuneBytes: 0)
            return a
        }())
}
