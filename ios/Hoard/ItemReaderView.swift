import SwiftUI
import KeepKit
import SafariServices

struct ItemReaderView: View {
  @Environment(SessionStore.self) private var session
  @Environment(\.dismiss) private var dismiss
  var itemID: String

  @State private var item: HoardItem?
  @State private var loadError: String?
  @State private var copied = false
  @State private var showSafari = false
  @State private var view: ReaderView = .reader
  @State private var reprocessing = false
  @State private var stage = 0
  @State private var reMsg: String?
  @State private var actionError: String?

  enum ReaderView: String, CaseIterable { case reader = "Reader"; case original = "Original" }

  var body: some View {
    ZStack {
      HoardTheme.canvas.ignoresSafeArea()
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          if let loaded = item {
            // Eyebrow
            HStack(spacing: 6) {
              Text(loaded.type.uppercased()).font(.mono(11)).foregroundStyle(HoardTheme.faint)
              if !loaded.domain.isEmpty {
                Text("· \(loaded.domain)").font(.mono(11)).foregroundStyle(HoardTheme.faint)
              }
              Spacer()
              StatusPill(loaded.status)
            }
            Text(loaded.title)
              .font(.title(24))
              .foregroundStyle(HoardTheme.text)
              .tracking(-0.48)
            metadataLine(loaded)

            if !loaded.tagList.isEmpty {
              Text("tagged: \(loaded.tagList.joined(separator: ", "))")
                .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            }

            // Actions
            VStack(spacing: 8) {
              HStack(spacing: 8) {
                if loaded.sourceUrl != nil {
                  Picker("View", selection: $view) {
                    ForEach(ReaderView.allCases, id: \.self) { v in Text(v.rawValue).tag(v) }
                  }
                  .pickerStyle(.segmented)
                  .frame(maxWidth: 200)
                }
                Button(copied ? "Copied ✓" : "Copy Markdown") {
                  UIPasteboard.general.string = loaded.markdown
                  copied = true
                  DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
                }
                .buttonStyle(.bordered).font(.mono(12)).tint(HoardTheme.accentHi)
                Spacer()
              }
              HStack(spacing: 8) {
                if loaded.sourceUrl != nil {
                  Button(reprocessing ? "Working…" : "Reprocess") {
                    Task { await reprocess() }
                  }
                  .buttonStyle(.bordered).font(.mono(12)).disabled(reprocessing)
                }
                Menu("Move") {
                  Button("Save") { Task { await moveTo("saved") } }
                  Button("Done") { Task { await moveTo("done") } }
                  Button("Archive") { Task { await moveTo("archived") } }
                  Button("Back to Inbox") { Task { await moveTo("inbox") } }
                }
                .buttonStyle(.bordered).font(.mono(12))
                Button(role: .destructive) { Task { await deleteSelf() } } label: {
                  Image(systemName: "trash").font(.system(size: 12))
                }
                .buttonStyle(.bordered).font(.mono(12))
              }
            }

            if reprocessing {
              HStack(spacing: 8) {
                ProgressView().tint(HoardTheme.accentHi)
                Text("\(reproStages[min(stage, 2)])…").font(.mono(11)).foregroundStyle(HoardTheme.muted)
              }
            }
            if let reMsg {
              Text(reMsg).font(.mono(11)).foregroundStyle(HoardTheme.muted)
            }
            if let actionError {
              ErrorBanner(actionError)
            }

            if view == .original, let s = loaded.sourceUrl {
              VStack(alignment: .leading, spacing: 8) {
                if loaded.extractionError != nil {
                  Text("Reader isn't available for this page yet — showing the original.")
                    .font(.inter(13)).foregroundStyle(HoardTheme.muted)
                }
                Button("Open original in browser ↗") { showSafari = true }
                  .buttonStyle(.borderedProminent).tint(HoardTheme.accent)
                Text(s).font(.mono(11)).foregroundStyle(HoardTheme.muted).textSelection(.enabled)
              }
              .padding(.top, 4)
            } else {
              if loaded.extractionError != nil {
                Text("Reader isn't available for this page yet. Try Reprocess or read the original.")
                  .font(.inter(13)).foregroundStyle(HoardTheme.muted)
                  .padding(10)
                  .background(HoardTheme.amber.opacity(0.07))
                  .clipShape(RoundedRectangle(cornerRadius: 8))
              }
              HoardMarkdown(source: loaded.markdown)
                .padding(.top, 4)
            }
          } else if let loadError {
            ErrorBanner(loadError) { Task { await load() } }
              .padding(.top, 20)
          } else {
            VStack(spacing: 12) {
              ProgressView().tint(HoardTheme.accentHi)
              Text("Loading…").font(.mono(12)).foregroundStyle(HoardTheme.faint)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
          }
        }
        .padding()
      }
    }
    .navigationTitle("Reader")
    .navigationBarTitleDisplayMode(.inline)
    .task { await load() }
    .sheet(isPresented: $showSafari) {
      if let loaded = item, let s = loaded.sourceUrl, let u = URL(string: s) {
        SafariView(url: u)
      }
    }
  }

  private var reproStages: [String] { ["Fetching", "Extracting", "Converting"] }

  @ViewBuilder
  private func metadataLine(_ loaded: HoardItem) -> some View {
    let parts: [String] = [
      loaded.author,
      loaded.publishedAt.map { "Published \($0.formatted(date: .abbreviated, time: .omitted))" },
      loaded.extractedAt.map { "Saved \($0.formatted(date: .abbreviated, time: .omitted))" },
    ].compactMap { $0 }
    if !parts.isEmpty {
      Text(parts.joined(separator: " · ")).font(.mono(11)).foregroundStyle(HoardTheme.muted)
    }
  }

  private func load() async {
    loadError = nil
    do {
      let fetched = try await session.client.item(id: itemID)
      item = fetched
      if fetched.extractionError != nil { view = .original }
    } catch {
      loadError = error.localizedDescription
    }
  }

  private func reprocess() async {
    reprocessing = true; reMsg = nil; actionError = nil; stage = 0
    let ticker = Task {
      while reprocessing && stage < 2 {
        try? await Task.sleep(nanoseconds: 900_000_000)
        if reprocessing { stage += 1 }
      }
    }
    do {
      let updated = try await session.client.reprocess(id: itemID)
      item = updated
      reMsg = "Ready — document refreshed."
      if updated.extractionError == nil { view = .reader }
    } catch {
      actionError = error.localizedDescription
    }
    reprocessing = false
    ticker.cancel()
  }

  private func moveTo(_ status: String) async {
    actionError = nil
    do {
      let updated = try await session.client.updateItem(id: itemID, status: status)
      item = updated
    } catch {
      actionError = error.localizedDescription
    }
  }

  private func deleteSelf() async {
    do {
      try await session.client.deleteItem(id: itemID)
      dismiss()
    } catch {
      actionError = error.localizedDescription
    }
  }
}

struct SafariView: UIViewControllerRepresentable {
  var url: URL
  func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
  func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}
