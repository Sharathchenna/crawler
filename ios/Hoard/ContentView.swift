import SwiftUI
import KeepKit

struct ContentView: View {
  @Environment(SessionStore.self) private var session

  var body: some View {
    Group {
      if session.isSignedIn {
        MainTabs()
          .task { await session.flushOutbox() }
      } else {
        AuthView()
      }
    }
  }
}

struct MainTabs: View {
  @Environment(SessionStore.self) private var session
  @State private var showCapture = false
  @State private var inboxCount = 0

  var body: some View {
    TabView {
      LibraryView()
        .tabItem { Label("Library", systemImage: "tray.full") }
      InboxView(count: $inboxCount)
        .tabItem { Label("Inbox", systemImage: "inbox") }
        .badge(inboxCount)
      NotesView()
        .tabItem { Label("Notes", systemImage: "note.text") }
      SearchView()
        .tabItem { Label("Search", systemImage: "magnifyingglass") }
      SettingsView()
        .tabItem { Label("Settings", systemImage: "gear") }
    }
    .tint(HoardTheme.accentHi)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { showCapture = true } label: { Image(systemName: "plus.circle.fill").font(.system(size: 22)) }
          .accessibilityLabel("Quick capture")
          .tint(HoardTheme.accentHi)
      }
    }
    .sheet(isPresented: $showCapture) {
      QuickCaptureSheet(onSaved: { refreshInboxCount() })
        .presentationDetents([.medium, .large])
    }
    .task { refreshInboxCount() }
  }

  private func refreshInboxCount() {
    Task {
      let items = (try? await session.client.items(status: "inbox")) ?? []
      inboxCount = items.count
    }
  }
}

// MARK: - Capture

enum CaptureMode: String, CaseIterable { case link = "Link"; case text = "Text" }
private let captureStages = ["Fetching", "Extracting", "Converting", "Ready"]

struct QuickCaptureSheet: View {
  @Environment(SessionStore.self) private var session
  @Environment(\.dismiss) private var dismiss
  var onSaved: () -> Void = {}

  @State private var mode: CaptureMode = .link
  @State private var url = ""
  @State private var title = ""
  @State private var bodyText = ""
  @State private var busy = false
  @State private var stage = 0
  @State private var result: String?
  @State private var isError = false

  var canSave: Bool {
    if busy { return false }
    if mode == .link { return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    return !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 14) {
        Picker("Kind", selection: $mode) {
          ForEach(CaptureMode.allCases, id: \.self) { m in Text(m.rawValue).tag(m) }
        }
        .pickerStyle(.segmented)

        if mode == .link {
          HStack(spacing: 10) {
            Image(systemName: "link").foregroundStyle(HoardTheme.faint)
            TextField("Paste a URL — https://…", text: $url)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .keyboardType(.URL)
              .font(.mono(14))
          }
          .padding(12)
          .background(HoardTheme.hover)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
          Text("Saving runs Fetching → Extracting → Converting, then lands in Inbox.")
            .font(.mono(11)).foregroundStyle(HoardTheme.faint)
        } else {
          TextField("Title (optional)", text: $title)
            .font(.inter(15))
            .padding(12)
            .background(HoardTheme.hover)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
          TextEditor(text: $bodyText)
            .font(.inter(14))
            .frame(minHeight: 120)
            .padding(8)
            .background(HoardTheme.hover)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
        }

        if busy {
          HStack(spacing: 8) {
            ProgressView().tint(HoardTheme.accentHi)
            Text("\(captureStages[min(stage, 2)])…").font(.mono(12)).foregroundStyle(HoardTheme.muted)
          }
        }
        if let result {
          HStack(alignment: .top, spacing: 8) {
            Image(systemName: isError ? "exclamationmark.triangle" : "checkmark.circle.fill")
              .foregroundStyle(isError ? HoardTheme.amber : HoardTheme.green)
            Text(result).font(.inter(13)).foregroundStyle(HoardTheme.textBody)
          }
          .padding(10)
          .background((isError ? HoardTheme.amber : HoardTheme.green).opacity(0.08))
          .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        Spacer()
      }
      .padding()
      .background(HoardTheme.canvas)
      .navigationTitle("Save to Hoard")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(busy ? "Saving…" : "Save") { Task { await save() } }
            .bold()
            .disabled(!canSave)
        }
      }
    }
  }

  private func save() async {
    busy = true; isError = false; result = nil; stage = 0
    // Animate pipeline stages like the web capture bar.
    let ticker = Task {
      while busy && stage < 2 {
        try? await Task.sleep(nanoseconds: 900_000_000)
        if busy { stage += 1 }
      }
    }
    do {
      if mode == .link {
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = try await session.client.capture(url: trimmed)
        stage = 3
        result = "Ready — saved: \(item.title)"
        url = ""
      } else {
        let text = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        let item = try await session.client.captureText(
          title: title.isEmpty ? String(text.prefix(80)) : title, text: text)
        result = "Ready — saved: \(item.title)"
        bodyText = ""; title = ""
      }
      onSaved()
    } catch {
      isError = true
      result = error.localizedDescription
    }
    busy = false
    ticker.cancel()
  }
}
