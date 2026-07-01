import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var loginIdentifier = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email or username", text: $loginIdentifier)
                        .textContentType(.username)
                        .autocapitalization(.none)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                } header: {
                    Text("Sign in")
                        .foregroundStyle(AppTheme.textPrimary)
                }

                if let msg = auth.errorMessage {
                    Section {
                        Text(msg)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                Section {
                    Button(action: signIn) {
                        HStack {
                            Spacer()
                            if auth.isLoading {
                                ProgressView()
                                    .tint(AppTheme.textPrimary)
                            } else {
                                Text("Sign in")
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                    .disabled(auth.isLoading || loginIdentifier.isEmpty || password.isEmpty)
                }
            }
            .scrollContentBackground(.hidden)
            .background(PurpleGradientBackground())
            .foregroundStyle(AppTheme.textPrimary)
            .navigationTitle("Tuneable")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private func signIn() {
        Task {
            await auth.login(identifier: loginIdentifier, password: password)
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthViewModel())
}
