import Foundation
import SwiftUI

@MainActor
final class AuthViewModel: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    @Published var errorMessage: String?
    var isLoggedIn: Bool { user != nil }

    private let auth = AuthService.shared

    init() {
        user = auth.cachedUser()
    }

    func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await auth.login(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func refreshProfile() async {
        guard auth.isLoggedIn else { return }
        isLoading = true
        errorMessage = nil
        do {
            user = try await auth.fetchProfile()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func logout() {
        auth.logout()
        user = nil
        errorMessage = nil
    }
}
