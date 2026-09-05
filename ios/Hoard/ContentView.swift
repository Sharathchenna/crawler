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
  @State private var captureURL = ""
  @State private var showCapture = false

  var body: some View {
    TabView {
      LibraryView()
        .tabItem { Label("Library", systemImage: "tray.full") }
      InboxView()
        .tabItem { Label("Inbox", systemImage: "inbox") }
      NotesView()
        .tabItem { Label("Notes", systemImage: "note.text") }
      SearchView()
        .tabItem { Label("Search", systemImage: "magnifyingglass") }
      SettingsView()
        .tabItem { Label("Settings", systemImage: "gear") }
    }
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { showCapture = true } label: { Image(systemName: "plus") }
          .accessibilityLabel("Quick capture")
      }
    }
    .tint(HoardTheme.accent)
    .sheet(isPresented: $showCapture) {
      QuickCaptureSheet()
    }
  }
}

struct QuickCaptureSheet: View {
  @Environment(SessionStore.self) private var session
  @Environment(\.dismiss) private var dismiss
  @State private var url = ""
  @State private var message: String?
  @State private var busy = false

  var body: some View {
    NavigationStack {
      Form {
        TextField("Paste a URL", text: $url)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .font(.mono(14))
        if let message {
          Text(message).font(.mono(12)).foregroundStyle(.secondary)
        }
      }
      .navigationTitle("Save to Hoard")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(busy ? "Saving…" : "Save") {
            Task {
              busy = true
              do {
                let item = try await session.client.capture(url: url)
                message = "Saved ✓ \(item.title)"
                url = ""
              } catch {
                message = error.localizedDescription
              }
              busy = false
            }
          }.disabled(url.isEmpty || busy)
        }
      }
    }
  }
}
