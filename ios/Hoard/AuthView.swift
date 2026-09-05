import SwiftUI
import KeepKit

/// Sign-in is token-based: sign in once in the browser (Cloudflare Access
/// handles identity there), issue a token in Settings → Agent tokens, then
/// paste it here with the Access service-token pair (Zero Trust → Access →
/// Service Tokens) so the app can reach an Access-protected API.
struct AuthView: View {
  @Environment(SessionStore.self) private var session
  @State private var email = ""
  @State private var token = ""
  @State private var accessId = ""
  @State private var accessSecret = ""
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
          Text("Sign in with a token from Settings.")
            .font(.inter(15))
            .foregroundStyle(HoardTheme.muted)
            .padding(.top, 6)
          Text("Identity lives in Cloudflare Access — the app just holds keys.")
            .font(.mono(11))
            .foregroundStyle(HoardTheme.faint)
            .padding(.top, 4)

          VStack(spacing: 12) {
            field(icon: "person", placeholder: "Display name (optional)", text: $email, secure: false, keyboard: .default)
            field(icon: "key", placeholder: "Hoard token (Settings → Agent tokens)", text: $token, secure: true, keyboard: .default)
            field(icon: "shield", placeholder: "Access Client ID (optional)", text: $accessId, secure: false, keyboard: .default)
            field(icon: "lock", placeholder: "Access Client Secret (optional)", text: $accessSecret, secure: true, keyboard: .default)

            if let errorMessage {
              ErrorBanner(errorMessage)
            }

            Button {
              Task { await connect() }
            } label: {
              HStack {
                if busy { ProgressView().tint(.white) }
                Text(busy ? "Connecting…" : "Connect").font(.inter(15, weight: .medium))
              }
              .frame(maxWidth: .infinity)
              .padding(.vertical, 13)
            }
            .buttonStyle(.plain)
            .background(HoardTheme.accent)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusControl))
            .shadow(color: HoardTheme.accentGlow, radius: 12)
            .disabled(busy || token.isEmpty)
            .opacity(busy || token.isEmpty ? 0.6 : 1)

            HStack(spacing: 6) {
              Image(systemName: "checkmark.circle.fill").foregroundStyle(HoardTheme.green).font(.system(size: 11))
              Text("Access ID + secret only needed behind Cloudflare Access")
                .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            }
          }
          .padding(16)
          .hoardCard()
          .padding(.top, 28)

          Text(HoardConfig.baseURL.absoluteString)
            .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            .padding(.top, 16)
          Spacer(minLength: 40)
        }
        .padding(.horizontal, 24)
      }
    }
  }

  private func field(icon: String, placeholder: String, text: Binding<String>, secure: Bool, keyboard: UIKeyboardType) -> some View {
    HStack(spacing: 10) {
      Image(systemName: icon).foregroundStyle(HoardTheme.faint).frame(width: 20)
      Group {
        if secure {
          SecureField(placeholder, text: text)
        } else {
          TextField(placeholder, text: text)
        }
      }
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .keyboardType(keyboard)
      .font(.inter(15))
      .foregroundStyle(HoardTheme.text)
    }
    .padding(12)
    .background(HoardTheme.hover)
    .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusControl))
    .overlay(RoundedRectangle(cornerRadius: HoardTheme.radiusControl).stroke(HoardTheme.border, lineWidth: 1))
  }

  private func connect() async {
    busy = true; errorMessage = nil
    let t = token.trimmingCharacters(in: .whitespacesAndNewlines)
    let id = accessId.trimmingCharacters(in: .whitespacesAndNewlines)
    let secret = accessSecret.trimmingCharacters(in: .whitespacesAndNewlines)
    // Verify before storing: a light read with these credentials.
    let probe = APIClient(
      baseURL: HoardConfig.baseURL,
      token: { t },
      accessHeaders: {
        id.isEmpty || secret.isEmpty
          ? [:]
          : ["CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret]
      }
    )
    do {
      _ = try await probe.tags()
      session.signIn(token: t, accessId: id, accessSecret: secret, email: email.trimmingCharacters(in: .whitespacesAndNewlines))
    } catch {
      errorMessage = error.localizedDescription
    }
    busy = false
  }
}
