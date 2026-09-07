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

  init() {
    // Re-present the captured Cloudflare Access session to URLSession so
    // API requests clear the Access edge just like the website does.
    AccessCookieStore.installStored(baseURL: HoardConfig.baseURL)
  }

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

  /// Sign in via the in-app Cloudflare Access browser flow: store the minted
  /// bearer token and the captured session cookies, then present the cookies
  /// to URLSession so every subsequent request passes the Access edge.
  func signInWithAccess(token: String, email: String, cookies: [HoardKeychain.AccessCookie]) {
    try? HoardKeychain.saveToken(token)
    try? HoardKeychain.saveAccessCookies(cookies)
    AccessCookieStore.install(baseURL: HoardConfig.baseURL, cookies: cookies)
    if !email.isEmpty { UserDefaults.standard.set(email, forKey: "hoard.email") }
    self.token = token
    if !email.isEmpty { self.email = email }
  }

  func signOut() {
    HoardKeychain.deleteToken()
    HoardKeychain.deleteAccess()
    HoardKeychain.deleteAccessCookies()
    AccessCookieStore.clear(baseURL: HoardConfig.baseURL)
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
