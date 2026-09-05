import SwiftUI
import KeepKit

struct AuthView: View {
  @Environment(SessionStore.self) private var session
  @State private var email = "demo@hoard.local"
  @State private var password = "password"
  @State private var error: String?
  @State private var busy = false

  var body: some View {
    VStack(spacing: 16) {
      Text("hoard.").font(.mono(28)).padding(.top, 60)
      Text("Save anything as Markdown.").foregroundStyle(.secondary)
      TextField("Email", text: $email)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .textFieldStyle(.roundedBorder)
      SecureField("Password (8+ chars)", text: $password)
        .textFieldStyle(.roundedBorder)
      if let error {
        Text(error).foregroundStyle(.red).font(.callout)
          .accessibilityLabel("Sign-in error")
      }
      Button(busy ? "…" : "Sign in") {
        Task {
          busy = true; error = nil
          do {
            let token = try await APIClient.signInForToken(baseURL: HoardConfig.baseURL, email: email, password: password)
            session.signIn(token: token)
          } catch {
            self.error = error.localizedDescription
          }
          busy = false
        }
      }
      .buttonStyle(.borderedProminent)
      .disabled(busy)
      Spacer()
    }
    .padding()
    .font(.inter(16))
  }
}
