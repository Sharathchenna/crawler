import SwiftUI
import KeepKit

struct ItemRow: View {
  var item: HoardItem

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: item.icon)
        .foregroundStyle(HoardTheme.muted)
        .frame(width: 28, height: 28)
        .background(HoardTheme.hover)
        .clipShape(RoundedRectangle(cornerRadius: HoardTheme.radiusControl))
      VStack(alignment: .leading, spacing: 2) {
        Text(item.title).font(.inter(14, weight: .medium)).lineLimit(2).tracking(-0.28)
        Text("\(item.domain) · \(item.createdAt.formatted(.relative(presentation: .named))) · \(item.status)")
          .font(.mono(11)).foregroundStyle(HoardTheme.muted)
        if !item.excerpt.isEmpty {
          Text(item.excerpt).font(.inter(13)).foregroundStyle(HoardTheme.muted).lineLimit(2)
        }
      }
    }
    .padding(.vertical, 4)
  }
}

struct LibraryView: View {
  @Environment(SessionStore.self) private var session
  @State private var items: [HoardItem] = []
  @State private var error: String?

  var body: some View {
    NavigationStack {
      List(items) { item in
        NavigationLink { ItemReaderView(itemID: item.id) } label: { ItemRow(item: item) }
          .swipeActions {
            Button("Archive") { Task { try? await session.client.updateItem(id: item.id, status: "archived"); await load() } }
            Button("Done") { Task { try? await session.client.updateItem(id: item.id, status: "done"); await load() } }
          }
      }
      .navigationTitle("Library")
      .refreshable { await load() }
      .task { await load() }
      .overlay {
        if items.isEmpty {
          ContentUnavailableView("Nothing here yet", systemImage: "tray",
            description: Text("Tap ＋ and paste a URL — your first save takes two seconds."))
        }
      }
    }
  }

  private func load() async {
    do {
      let all = try await session.client.items()
      items = all.filter { $0.status != "archived" }
    } catch {
      self.error = error.localizedDescription
    }
  }
}

struct InboxView: View {
  @Environment(SessionStore.self) private var session
  @State private var items: [HoardItem] = []

  var body: some View {
    NavigationStack {
      List(items) { item in
        VStack(alignment: .leading) {
          NavigationLink { ItemReaderView(itemID: item.id) } label: { ItemRow(item: item) }
          HStack {
            Button("Save") { triage(item, "saved") }
            Button("Done") { triage(item, "done") }
            Button("Archive") { triage(item, "archived") }
          }
          .buttonStyle(.bordered)
          .font(.mono(12))
        }
      }
      .navigationTitle("Inbox")
      .refreshable { await load() }
      .task { await load() }
      .overlay {
        if items.isEmpty {
          ContentUnavailableView("Inbox zero", systemImage: "inbox",
            description: Text("Fresh captures land here for triage."))
        }
      }
    }
  }

  private func load() async {
    items = (try? await session.client.items(status: "inbox")) ?? []
  }

  private func triage(_ item: HoardItem, _ status: String) {
    Task {
      try? await session.client.updateItem(id: item.id, status: status)
      await load()
    }
  }
}
