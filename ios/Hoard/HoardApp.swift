import SwiftUI
import KeepKit

@main
struct HoardApp: App {
  @State private var session = SessionStore()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environment(session)
        .preferredColorScheme(.dark)
        .background(HoardTheme.canvas)
    }
  }
}

@Observable
final class SessionStore {
  var token: String? = HoardKeychain.loadToken()
  var email: String = UserDefaults.standard.string(forKey: "hoard.email") ?? ""
  var isSignedIn: Bool { token != nil && !(token?.isEmpty ?? true) }

  var client: APIClient {
    APIClient(
      baseURL: HoardConfig.baseURL,
      token: { HoardKeychain.loadToken() },
      accessHeaders: { HoardKeychain.accessHeaderFields() }
    )
  }

  func signIn(token: String, accessId: String, accessSecret: String, email: String) {
    try? HoardKeychain.saveToken(token)
    if !accessId.isEmpty, !accessSecret.isEmpty {
      try? HoardKeychain.saveAccess(id: accessId, secret: accessSecret)
    }
    UserDefaults.standard.set(email, forKey: "hoard.email")
    self.token = token
    self.email = email
  }

  func signOut() {
    HoardKeychain.deleteToken()
    HoardKeychain.deleteAccess()
    token = nil
  }

  /// Flush offline outbox captured by the Share Extension.
  func flushOutbox() async {
    let entries = Outbox.load()
    guard !entries.isEmpty, isSignedIn else { return }
    for e in entries {
      do {
        if let url = e.url {
          _ = try await client.capture(url: url)
        } else if let text = e.text {
          _ = try await client.captureText(title: e.title ?? "Shared note", text: text)
        }
        Outbox.remove(e.id)
      } catch {
        continue
      }
    }
  }
}
