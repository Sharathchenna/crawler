import Foundation

/// Bridges the Cloudflare Access session captured by the in-app browser login
/// into `URLSession.shared`'s cookie jar, so plain API requests carry the same
/// `CF_Authorization` session the website uses to pass the Access edge.
///
/// `URLSession.shared` sends cookies from `HTTPCookieStorage.shared` automatically
/// (`httpShouldHandleCookies` defaults to true), so once these are installed the
/// `APIClient` needs no changes.
public enum AccessCookieStore {
  /// Install the stored Access cookies for `baseURL`'s host. Call at launch and
  /// right after a successful web login.
  public static func install(baseURL: URL, cookies: [HoardKeychain.AccessCookie]) {
    guard let host = baseURL.host else { return }
    for c in cookies where !c.value.isEmpty {
      guard let cookie = HTTPCookie(properties: [
        .name: c.name,
        .value: c.value,
        .domain: host,
        .path: "/",
        .secure: "TRUE",
      ]) else { continue }
      HTTPCookieStorage.shared.setCookie(cookie)
    }
  }

  /// Re-install whatever is persisted in the shared Keychain.
  public static func installStored(baseURL: URL) {
    install(baseURL: baseURL, cookies: HoardKeychain.loadAccessCookies())
  }

  /// Drop the Access cookies for `baseURL`'s host from the shared jar (sign out).
  public static func clear(baseURL: URL) {
    guard let host = baseURL.host, let all = HTTPCookieStorage.shared.cookies else { return }
    for cookie in all where cookie.domain.contains(host) || host.contains(cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) {
      HTTPCookieStorage.shared.deleteCookie(cookie)
    }
  }
}
