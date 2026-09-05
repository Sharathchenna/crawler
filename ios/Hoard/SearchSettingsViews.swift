import SwiftUI
import KeepKit

struct SearchView: View {
  @Environment(SessionStore.self) private var session
  @State private var q = ""
  @State private var hits: [SearchHit] = []
  @State private var busy = false

  var notes: [SearchHit] { hits.filter { $0.kind == "note" } }
  var items: [SearchHit] { hits.filter { $0.kind == "item" } }

  var body: some View {
    NavigationStack {
      List {
        if !notes.isEmpty {
          Section("Notes") {
            ForEach(notes) { h in
              NavigationLink { NoteEditorView(noteID: h.id) } label: {
                VStack(alignment: .leading) {
                  Text(h.title).font(.inter(15, weight: .medium))
                  Text(h.snippet).font(.inter(13)).foregroundStyle(.secondary).lineLimit(3)
                }
              }
            }
          }
        }
        if !items.isEmpty {
          Section("Items") {
            ForEach(items) { h in
              NavigationLink { ItemReaderView(itemID: h.id) } label: {
                VStack(alignment: .leading) {
                  Text(h.title).font(.inter(15, weight: .medium))
                  Text(h.snippet).font(.inter(13)).foregroundStyle(.secondary).lineLimit(3)
                }
              }
            }
          }
        }
      }
      .navigationTitle("Search")
      .searchable(text: $q, prompt: "Search titles and Markdown")
      .onChange(of: q) { _, v in
        Task {
          try? await Task.sleep(nanoseconds: 300_000_000)
          guard v == q, !v.trimmingCharacters(in: .whitespaces).isEmpty else {
            if v.isEmpty { hits = [] }
            return
          }
          busy = true
          hits = (try? await session.client.search(q: v)) ?? []
          busy = false
        }
      }
      .overlay {
        if hits.isEmpty && !q.isEmpty && !busy {
          ContentUnavailableView.search
        }
      }
    }
  }
}

struct SettingsView: View {
  @Environment(SessionStore.self) private var session
  @State private var freshToken: String?
  @State private var slug = "claude-code"
  @State private var serverName = "hoard"

  var body: some View {
    NavigationStack {
      Form {
        Section("Account") {
          Button("Sign out", role: .destructive) { session.signOut() }
        }
        Section("Agent token") {
          Button("Issue token") {
            Task { freshToken = try? await session.client.issueToken() }
          }
          if let freshToken {
            Text(freshToken).font(.mono(12)).textSelection(.enabled)
          } else {
            Text("Shown once — copy it now.").font(.mono(12)).foregroundStyle(.secondary)
          }
        }
        Section("Connect an MCP client") {
          Picker("Client", selection: $slug) {
            ForEach(MCPConfig.clients) { c in
              Text("\(c.name) — \(c.hint)").tag(c.slug)
            }
          }
          TextField("Server name", text: $serverName)
          let cfg = MCPConfig.build(slug: slug, name: serverName, url: HoardConfig.mcpURL.absoluteString)
          Text(cfg.label).font(.mono(11)).foregroundStyle(.secondary)
          Text(cfg.snippet).font(.mono(12)).textSelection(.enabled)
          Text(cfg.instruction).font(.inter(13)).foregroundStyle(.secondary)
        }
      }
      .navigationTitle("Settings")
    }
  }
}
