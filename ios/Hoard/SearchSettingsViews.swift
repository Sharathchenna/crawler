import SwiftUI
import KeepKit

// MARK: - Search

enum SearchScope: String, CaseIterable { case all = "All"; case items = "Items"; case notes = "Notes" }

struct SearchView: View {
  @Environment(SessionStore.self) private var session
  @State private var q = ""
  @State private var scope: SearchScope = .all
  @State private var hits: [SearchHit] = []
  @State private var busy = false
  @State private var errorMessage: String?

  var filtered: [SearchHit] {
    switch scope {
    case .all: return hits
    case .items: return hits.filter { $0.kind == "item" }
    case .notes: return hits.filter { $0.kind == "note" }
    }
  }
  var noteHits: [SearchHit] { filtered.filter { $0.kind == "note" } }
  var itemHits: [SearchHit] { filtered.filter { $0.kind == "item" } }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        Picker("Scope", selection: $scope) {
          ForEach(SearchScope.allCases, id: \.self) { s in Text(s.rawValue).tag(s) }
        }
        .pickerStyle(.segmented)
        .padding([.horizontal, .top], 12)
        if let errorMessage {
          ErrorBanner(errorMessage).padding([.horizontal, .top])
        }
        if busy {
          HStack(spacing: 8) {
            ProgressView().tint(HoardTheme.accentHi)
            Text("Searching…").font(.mono(12)).foregroundStyle(HoardTheme.faint)
          }
          .padding(.top, 16)
        }
        List {
          if !noteHits.isEmpty {
            Section("Notes") {
              ForEach(noteHits) { h in
                NavigationLink { NoteEditorView(noteID: h.id) } label: {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(h.title).font(.inter(14, weight: .medium)).foregroundStyle(HoardTheme.text)
                    Text(h.snippet).font(.inter(13)).foregroundStyle(HoardTheme.muted).lineLimit(3)
                  }
                }
                .listRowBackground(HoardTheme.raised)
              }
            }
          }
          if !itemHits.isEmpty {
            Section("Items") {
              ForEach(itemHits) { h in
                NavigationLink { ItemReaderView(itemID: h.id) } label: {
                  VStack(alignment: .leading, spacing: 2) {
                    Text(h.title).font(.inter(14, weight: .medium)).foregroundStyle(HoardTheme.text)
                    Text(h.snippet).font(.inter(13)).foregroundStyle(HoardTheme.muted).lineLimit(3)
                  }
                }
                .listRowBackground(HoardTheme.raised)
              }
            }
          }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .overlay {
          if filtered.isEmpty && !q.isEmpty && !busy {
            ContentUnavailableView.search
          } else if filtered.isEmpty && q.isEmpty {
            EmptyState("Search everything", hint: "Titles, excerpts, and full Markdown — items and notes.", systemImage: "magnifyingglass")
              .padding()
          }
        }
      }
      .navigationTitle("Search")
      .background(HoardTheme.canvas)
      .searchable(text: $q, prompt: "Search titles and Markdown")
      .task(id: q) {
        let query = q.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else {
          hits = []; busy = false; errorMessage = nil
          return
        }
        try? await Task.sleep(nanoseconds: 350_000_000)
        guard !Task.isCancelled, query == q.trimmingCharacters(in: .whitespaces) else { return }
        busy = true; errorMessage = nil
        do {
          hits = try await session.client.search(q: query)
        } catch {
          errorMessage = error.localizedDescription
          hits = []
        }
        busy = false
      }
    }
  }
}

// MARK: - Settings

struct SettingsView: View {
  @Environment(SessionStore.self) private var session
  @State private var freshToken: String?
  @State private var tokenRows: [AgentTokenRow] = []
  @State private var tokenError: String?
  @State private var issuing = false
  @State private var copiedKey: String?
  @State private var slug = "claude-code"
  @State private var serverName = "hoard"

  var body: some View {
    NavigationStack {
      Form {
        Section("Account") {
          HStack {
            Image(systemName: "person.circle").foregroundStyle(HoardTheme.muted)
            VStack(alignment: .leading) {
              Text(session.email.isEmpty ? "Signed in" : session.email)
                .font(.inter(14, weight: .medium))
              Text(HoardConfig.baseURL.absoluteString)
                .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            }
          }
          Button("Sign out", role: .destructive) { session.signOut() }
        }

        Section("Agent tokens") {
          Text("Tokens let the CLI, MCP clients, and this app read and write as you. Shown once — copy it now.")
            .font(.inter(13)).foregroundStyle(HoardTheme.muted)
          Button(issuing ? "Issuing…" : "Issue token") {
            Task { await issue() }
          }
          .disabled(issuing)
          if let freshToken {
            VStack(alignment: .leading, spacing: 8) {
              Text(freshToken).font(.mono(12)).textSelection(.enabled)
              Button(copiedKey == "token" ? "Copied ✓" : "Copy") {
                UIPasteboard.general.string = freshToken
                copiedKey = "token"
              }
              .font(.mono(12))
            }
            .padding(10)
            .background(HoardTheme.green.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8))
          }
          if let tokenError {
            Text(tokenError).font(.mono(11)).foregroundStyle(HoardTheme.red)
          }
          ForEach(tokenRows) { row in
            VStack(alignment: .leading, spacing: 2) {
              Text(row.client).font(.mono(12)).foregroundStyle(HoardTheme.text)
              Text("\(row.createdAt.formatted(date: .abbreviated, time: .omitted))\(row.lastUsedAt.map { " · used \($0.formatted(date: .abbreviated, time: .omitted))" } ?? " · never used")")
                .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            }
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
          Text(cfg.label).font(.mono(11)).foregroundStyle(HoardTheme.faint)
          Text(cfg.snippet).font(.mono(12)).textSelection(.enabled)
          Text(cfg.instruction).font(.inter(13)).foregroundStyle(HoardTheme.muted)
          Button(copiedKey == "snippet" ? "Copied ✓" : "Copy snippet") {
            UIPasteboard.general.string = cfg.snippet
            copiedKey = "snippet"
          }
          .font(.mono(12))
          Text("Needs a token: add `Authorization: Bearer hoard_…` if your client asks for headers.")
            .font(.mono(11)).foregroundStyle(HoardTheme.faint)
        }

        Section("About") {
          HStack {
            Text("hoard.").font(.mono(14))
            Spacer()
            Text("Markdown-first library").font(.mono(11)).foregroundStyle(HoardTheme.faint)
          }
          HStack {
            Text("API").font(.mono(12))
            Spacer()
            Text(HoardConfig.baseURL.absoluteString).font(.mono(11)).foregroundStyle(HoardTheme.faint)
          }
        }
      }
      .navigationTitle("Settings")
      .scrollContentBackground(.hidden)
      .background(HoardTheme.canvas)
      .task { await loadTokens() }
      .refreshable { await loadTokens() }
    }
  }

  private func issue() async {
    issuing = true; tokenError = nil
    do {
      freshToken = try await session.client.issueToken()
      await loadTokens()
    } catch {
      tokenError = error.localizedDescription
    }
    issuing = false
  }

  private func loadTokens() async {
    do {
      tokenRows = try await session.client.tokenRows()
    } catch {
      tokenError = error.localizedDescription
    }
  }
}
