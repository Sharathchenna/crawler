import SwiftUI
import WebKit
import KeepKit

/// In-app Cloudflare Access login — the same browser SSO the website uses.
/// The user signs in through Access in a `WKWebView`; once the session lands
/// back on the app origin we (1) mint a Hoard bearer token via a same-origin
/// `POST /api/tokens` (the Access cookie authorises it, exactly like the web
/// Settings page) and (2) hand back the `CF_*` session cookies so `URLSession`
/// can present the same session and clear the Access edge on every API call.
struct AccessLoginView: UIViewControllerRepresentable {
  let baseURL: URL
  /// (token, email, cookies)
  var onComplete: (String, String, [HoardKeychain.AccessCookie]) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIViewController(context: Context) -> UIViewController {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    webView.uiDelegate = context.coordinator
    webView.allowsBackForwardNavigationGestures = true
    context.coordinator.webView = webView
    // Start at the app root; Access intercepts and shows its login when needed.
    webView.load(URLRequest(url: baseURL))
    let vc = UIViewController()
    vc.view = webView
    return vc
  }

  func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

  final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    let parent: AccessLoginView
    weak var webView: WKWebView?
    private var finished = false

    init(_ parent: AccessLoginView) { self.parent = parent }

    // Some IdPs open the login in a popup (target=_blank / window.open).
    // Load it in the same web view instead of dropping it.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
      if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
        webView.load(URLRequest(url: url))
      }
      return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      guard !finished else { return }
      // Only attempt the mint once we're back on the app origin (post-SSO).
      guard let host = webView.url?.host, host == parent.baseURL.host else { return }

      let js = """
      let email = '';
      try {
        const idr = await fetch('/cdn-cgi/access/get-identity', { credentials: 'include' });
        if (idr.ok) { const j = await idr.json(); email = j.email || j.name || ''; }
      } catch (e) {}
      const r = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ client: 'ios' })
      });
      if (!r.ok) { return { ok: false, status: r.status }; }
      const d = await r.json();
      return { ok: true, token: (d.token || ''), email: email };
      """
      webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { [weak self] result in
        guard let self, !self.finished else { return }
        guard case .success(let value) = result,
              let dict = value as? [String: Any],
              (dict["ok"] as? Bool) == true,
              let token = dict["token"] as? String, !token.isEmpty else {
          // Not authenticated yet (or an interstitial) — wait for the next load.
          return
        }
        self.finished = true
        let email = (dict["email"] as? String) ?? ""
        self.captureCookies(webView) { cookies in
          self.parent.onComplete(token, email, cookies)
        }
      }
    }

    private func captureCookies(_ webView: WKWebView, done: @escaping ([HoardKeychain.AccessCookie]) -> Void) {
      let host = parent.baseURL.host ?? ""
      webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
        let wanted = cookies.filter { c in
          c.name.hasPrefix("CF") || c.domain.contains(host) || host.contains(c.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")))
        }
        // Deduplicate by name, prefer the app-host cookie.
        var byName: [String: HoardKeychain.AccessCookie] = [:]
        for c in wanted where !c.value.isEmpty { byName[c.name] = .init(name: c.name, value: c.value) }
        DispatchQueue.main.async { done(Array(byName.values)) }
      }
    }
  }
}
