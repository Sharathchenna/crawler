import UIKit
import SwiftUI
import UniformTypeIdentifiers
import KeepKit

/// Share Extension: appears from Safari, X, Mail, Files, Photos.
/// Accepts URLs + plain text; POSTs to /api/capture with the shared bearer token.
/// Offline/unauthenticated → enqueues into the App Group outbox. Never loses a save.
final class ShareViewController: UIViewController {
  private var status = "Saving to Hoard…"

  override func viewDidLoad() {
    super.viewDidLoad()
    let swiftUI = UIHostingController(rootView: ShareConfirmView(status: status, close: close))
    addChild(swiftUI)
    swiftUI.view.frame = view.bounds
    swiftUI.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(swiftUI.view)
    swiftUI.didMove(toParent: self)
    handle()
  }

  private func update(_ text: String) {
    status = text
    if let host = children.first as? UIHostingController<ShareConfirmView> {
      host.rootView = ShareConfirmView(status: text, close: close)
    }
  }

  private func close() {
    extensionContext?.completeRequest(returningItems: nil)
  }

  private func handle() {
    guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
          let providers = item.attachments, !providers.isEmpty else {
      update("Nothing to save.")
      return
    }
    // Prefer URL, then text.
    for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] data, _ in
        guard let self else { return }
        let urlString: String? = (data as? URL)?.absoluteString ?? (data as? String)
        Task { await self.save(url: urlString, text: nil) }
      }
      return
    }
    for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      p.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] data, _ in
        guard let self else { return }
        let text = data as? String
        // If the text is a URL, capture it as a URL.
        if let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), t.hasPrefix("http") {
          Task { await self.save(url: t, text: nil) }
        } else {
          Task { await self.save(url: nil, text: text) }
        }
      }
      return
    }
    update("That type isn't supported yet. Try a link or some text.")
  }

  private func save(url: String?, text: String?) async {
    guard let token = HoardKeychain.loadToken(), !token.isEmpty else {
      Outbox.enqueue(url: url, text: text, title: "Shared note")
      update("Saved to outbox — sign in to Hoard to send it. ✓")
      return
    }
    let client = APIClient(
      baseURL: HoardConfigBaseURL(),
      token: { HoardKeychain.loadToken() },
      accessHeaders: { HoardKeychain.accessHeaderFields() }
    )
    do {
      if let url {
        let item = try await client.capture(url: url)
        update("Saved to Hoard ✓\n\(item.title)")
      } else if let text {
        let item = try await client.captureText(title: String(text.prefix(80)), text: text)
        update("Saved to Hoard ✓\n\(item.title)")
      }
    } catch {
      Outbox.enqueue(url: url, text: text, title: "Shared note")
      update("Offline — queued in outbox. ✓")
    }
  }

  private func HoardConfigBaseURL() -> URL {
    if let s = Bundle.main.object(forInfoDictionaryKey: "HoardAPIBaseURL") as? String, let u = URL(string: s) {
      return u
    }
    return URL(string: "http://localhost:3000")!
  }
}

struct ShareConfirmView: View {
  var status: String
  var close: () -> Void

  var body: some View {
    VStack(spacing: 12) {
      Text("hoard.").font(.custom("JetBrainsMono-Regular", size: 20))
      Text(status).multilineTextAlignment(.center).font(.system(size: 14))
      Button("Done", action: close).buttonStyle(.borderedProminent)
    }
    .padding()
    .background(Color(hex: "080808"))
    .foregroundStyle(Color.white)
  }
}
