import SwiftUI
import KeepKit

struct AuthView: View {
  @Environment(SessionStore.self) private var session
  @State private var email = "demo@hoard.local"
  @State private var password = "password"
  @State private var showPassword = false
  @State private var errorMessage: String?
  @State private var busy = false

  var body: some View {
    ZStack {
      HoardTheme.canvas.ignoresSafeArea()
      // Soft indigo glow behind the hero, like web .hero-glow
      VStack {
        Ellipse()
          .fill(HoardTheme.accentGlow)
          .frame(height: 180)
          .blur(radius: 60)
          .padding(.horizontal, -40)
          .offset(y: -60)
        Spacer()
      }.ignoresSafeArea()

      ScrollView {
        VStack(spacing: 0) {
          Spacer(minLength: 72)
          Text("hoard.")
            .font(.mono(38))
            .foregroundStyle(HoardTheme.text)
            .tracking(-0.76)
          Text("Save anything as clean Markdown.")
            .font(.inter(15))
            .foregroundStyle(HoardTheme.muted)
            .padding(.top, 6)
          Text("For humans and agents — web, MCP, CLI, API, iOS.")
            .font(.mono(11))
            .foregroundStyle(HoardTheme.faint)
            .padding(.top, 4)

          VStack(spacing: 12) {
            // Email
            HStack(spacing: 10) {
              Image(systemName: "envelope").foregroundStyle(HoardTheme.faint).frame(width: 20)
              TextField("Email", text: $email)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .font(.inter(15))
                .foregroundStyle(HoardTheme.text)
            }
            .padding(12)
            .background(HoardTheme.hover)
            .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusControl))
            .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusControl).stroke(HoardTheme.border, lineWidth: 1))

            // Password
            HStack(spacing: 10) {
              Image(systemName: "lock").foregroundStyle(HoardTheme.faint).frame(width: 20)
              if showPassword {
                TextField("Password (8+ chars)", text: $password)
                  .textInputAutocapitalization(.never)
                  .autocorrectionDisabled()
                  .font(.inter(15))
                  .foregroundStyle(HoardTheme.text)
              } else {
                SecureField("Password (8+ chars)", text: $password)
                  .textInputAutocapitalization(.never)
                  .autocorrectionDisabled()
                  .font(.inter(15))
                  .foregroundStyle(HoardTheme.text)
              }
              Button { showPassword.toggle() } label: {
                Image(systemName: showPassword ? "eye.slash" : "eye")
                  .foregroundStyle(HoardTheme.faint)
              }
            }
            .padding(12)
            .background(HoardTheme.hover)
            .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusControl))
            .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusControl).stroke(HoardTheme.border, lineWidth: 1))

            if let errorMessage {
              ErrorBanner(errorMessage)
            }

            Button {
              Task { await signIn() }
            } label: {
              HStack {
                if busy { ProgressView().tint(.white) }
                Text(busy ? "Signing in…" : "Sign in").font(.inter(15, weight: .medium))
              }
              .frame(maxWidth: .infinity)
              .padding(.vertical, 13)
            }
            .buttonStyle(.plain)
            .background(HoardTheme.accent)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusControl))
            .shadow(color: HoardTheme.accentGlow, radius: 12)
            .disabled(busy || email.isEmpty || password.isEmpty)
            .opacity(busy || email.isEmpty || password.isEmpty ? 0.6 : 1)

            HStack(spacing: 6) {
              Image(systemName: "checkmark.circle.fill").foregroundStyle(HoardTheme.green).font(.system(size: 11))
              Text("Seeded demo: demo@hoard.local / password")
                .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            }
          }
          .padding(16)
          .hoardCard()
          .padding(.top, 28)

          Text(HoardConfig.baseURL.absoluteString)
            .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            .padding(.top, 16)
          Text("Bearer auth · App Group outbox · Share Extension")
            .font(.mono(10)).foregroundStyle(HoardTheme.faint.opacity(0.7))
            .padding(.top, 2)
          Spacer(minLength: 40)
        }
        .padding(.horizontal, 24)
      }
    }
  }

  private func signIn() async {
    busy = true; errorMessage = nil
    do {
      let token = try await APIClient.signInForToken(
        baseURL: HoardConfig.baseURL,
        email: email.trimmingCharacters(in: .whitespacesAndNewlines),
        password: password
      )
      session.signIn(token: token, email: email.trimmingCharacters(in: .whitespacesAndNewlines))
    } catch {
      errorMessage = error.localizedDescription
    }
    busy = false
  }
}
