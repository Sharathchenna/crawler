import SwiftUI
import KeepKit
import SafariServices

struct ItemReaderView: View {
  @Environment(SessionStore.self) private var session
  var itemID: String
  @State private var item: HoardItem?
  @State private var error: String?
  @State private var copied = false
  @State private var showSafari = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let item {
          Text("\(item.type.uppercased())\(item.domain.isEmpty ? "" : " · \(item.domain)")")
            .font(.mono(11)).foregroundStyle(.secondary)
          Text(item.title).font(.inter(24, weight: .semibold))
          HStack {
            if item.sourceUrl != nil {
              Button("Open source ↗") { showSafari = true }.buttonStyle(.bordered).font(.mono(12))
            }
            Button(copied ? "Copied ✓" : "Copy Markdown") {
              UIPasteboard.general.string = item.markdown
              copied = true
            }.buttonStyle(.bordered).font(.mono(12))
            Button("Archive") { Task { try? await session.client.updateItem(id: item.id, status: "archived") } }
              .buttonStyle(.bordered).font(.mono(12))
          }
          // System Markdown rendering (iOS 15+ AttributedString path kept simple):
          Text(tryAttributed(item.markdown))
            .font(.inter(15))
            .textSelection(.enabled)
        } else if let error {
          Text(error).foregroundStyle(.red)
        } else {
          ProgressView()
        }
      }
      .padding()
    }
    .navigationTitle("Reader")
    .navigationBarTitleDisplayMode(.inline)
    .task { await load() }
    .sheet(isPresented: $showSafari) {
      if let s = item?.sourceUrl, let u = URL(string: s) {
        SafariView(url: u)
      }
    }
  }

  private func load() async {
    do { item = try await session.client.item(id: itemID) }
    catch { error = error.localizedDescription }
  }

  private func tryAttributed(_ md: String) -> AttributedString {
    (try? AttributedString(markdown: md)) ?? AttributedString(md)
  }
}

struct SafariView: UIViewControllerRepresentable {
  var url: URL
  func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
  func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
