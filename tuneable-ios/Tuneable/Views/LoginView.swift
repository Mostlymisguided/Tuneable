import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                } header: {
                    Text("Sign in")
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
                                    .tint(.primary)
                            } else {
                                Text("Sign in")
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                    .disabled(auth.isLoading || email.isEmpty || password.isEmpty)
                }
            }
            .navigationTitle("Tuneable")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func signIn() {
        Task {
            await auth.login(email: email, password: password)
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthViewModel())
}
