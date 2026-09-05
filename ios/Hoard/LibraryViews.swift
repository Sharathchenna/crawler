import SwiftUI
import KeepKit

// MARK: - Shared row

struct ItemRow: View {
  var item: HoardItem

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: item.icon)
        .font(.system(size: 14))
        .foregroundStyle(HoardTheme.muted)
        .frame(width: 30, height: 30)
        .background(HoardTheme.hover)
        .clipShape(RoundedRectangle(cornerRadius: 6))
      VStack(alignment: .leading, spacing: 3) {
        Text(item.title)
          .font(.inter(14, weight: .medium))
          .foregroundStyle(HoardTheme.text)
          .lineLimit(2)
        HStack(spacing: 6) {
          if !item.domain.isEmpty {
            Text(item.domain).font(.mono(11)).foregroundStyle(HoardTheme.faint)
          }
          Text(item.timeAgo).font(.mono(11)).foregroundStyle(HoardTheme.faint)
          StatusPill(item.status)
        }
        if !item.excerpt.isEmpty {
          Text(item.excerpt)
            .font(.inter(13))
            .foregroundStyle(HoardTheme.muted)
            .lineLimit(2)
        }
        if !item.tagList.isEmpty {
          Text(item.tagList.joined(separator: ", "))
            .font(.mono(11)).foregroundStyle(HoardTheme.faint)
            .lineLimit(1)
        }
      }
    }
    .padding(.vertical, 5)
  }
}

// MARK: - Shared list state

@Observable
final class ItemListModel {
  var items: [HoardItem] = []
  var loading = false
  var errorMessage: String?
  var filter = "all"
  var query = ""

  var visible: [HoardItem] {
    var list = items
    if filter != "all" { list = list.filter { $0.status == filter } }
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if !q.isEmpty {
      list = list.filter {
        $0.title.lowercased().contains(q) || $0.excerpt.lowercased().contains(q) || $0.domain.lowercased().contains(q)
      }
    }
    return list
  }
}

struct ItemListContent: View {
  @Environment(SessionStore.self) private var session
  @Bindable var model: ItemListModel
  var statusParam: String? // nil = all non-archived (library); "inbox" = inbox
  var emptyTitle: String
  var emptyHint: String
  var emptyImage: String
  var showFilterChips: Bool
  var onChanged: () -> Void = {}

  var body: some View {
    VStack(spacing: 0) {
      if showFilterChips {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(["all", "saved", "inbox", "done", "archived"], id: \.self) { f in
              Button {
                model.filter = f
              } label: {
                Text(f.capitalized)
                  .font(.mono(12))
                  .padding(.horizontal, 12).padding(.vertical, 6)
                  .background(model.filter == f ? HoardTheme.accent : HoardTheme.hover)
                  .foregroundStyle(model.filter == f ? .white : HoardTheme.muted)
                  .clipShape(Capsule())
              }
            }
          }
          .padding(.horizontal)
          .padding(.vertical, 8)
        }
      }
      if let errorMessage = model.errorMessage {
        ErrorBanner(errorMessage) { Task { await load() } }
          .padding(.horizontal)
          .padding(.bottom, 8)
      }
      if model.loading && model.items.isEmpty {
        VStack(spacing: 10) {
          ForEach(0..<6, id: \.self) { _ in
            RoundedRectangle(cornerRadius: 10)
              .fill(HoardTheme.hover)
              .frame(height: 74)
              .redacted(reason: .placeholder)
          }
        }
        .padding(.horizontal)
      } else if model.visible.isEmpty {
        EmptyState(emptyTitle, hint: emptyHint, systemImage: emptyImage)
          .padding()
      } else {
        List(model.visible) { item in
          NavigationLink { ItemReaderView(itemID: item.id) } label: { ItemRow(item: item) }
            .listRowBackground(HoardTheme.raised)
            .swipeActions(edge: .trailing) {
              Button("Done") { Task { await setStatus(item, "done") } }.tint(HoardTheme.green)
              Button("Archive") { Task { await setStatus(item, "archived") } }.tint(HoardTheme.muted)
            }
            .swipeActions(edge: .leading) {
              if item.status == "inbox" {
                Button("Save") { Task { await setStatus(item, "saved") } }.tint(HoardTheme.accent)
              }
            }
            .contextMenu {
              if item.status == "inbox" {
                Button { Task { await setStatus(item, "saved") } } label: { Label("Save", systemImage: "tray.full") }
              }
              Button { Task { await setStatus(item, "done") } } label: { Label("Done", systemImage: "checkmark") }
              Button { Task { await setStatus(item, "archived") } } label: { Label("Archive", systemImage: "archivebox") }
              Button(role: .destructive) { Task { await deleteItem(item) } } label: { Label("Delete", systemImage: "trash") }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await load() }
      }
    }
    .task { await load() }
  }

  func load() async {
    model.loading = true; model.errorMessage = nil
    do {
      if let statusParam {
        model.items = try await session.client.items(status: statusParam)
      } else {
        let all = try await session.client.items()
        model.items = all.filter { $0.status != "archived" }
      }
    } catch {
      model.errorMessage = error.localizedDescription
    }
    model.loading = false
  }

  private func setStatus(_ item: HoardItem, _ status: String) async {
    do {
      _ = try await session.client.updateItem(id: item.id, status: status)
      await load()
      onChanged()
    } catch {
      model.errorMessage = error.localizedDescription
    }
  }

  private func deleteItem(_ item: HoardItem) async {
    do {
      try await session.client.deleteItem(id: item.id)
      await load()
      onChanged()
    } catch {
      model.errorMessage = error.localizedDescription
    }
  }
}

// MARK: - Library + Inbox

struct LibraryView: View {
  @State private var model = ItemListModel()

  var body: some View {
    NavigationStack {
      ItemListContent(
        model: model,
        statusParam: nil,
        emptyTitle: "Nothing here yet",
        emptyHint: "Tap ＋ and paste a URL — your first save takes two seconds.",
        emptyImage: "tray",
        showFilterChips: true
      )
      .searchable(text: $model.query, prompt: "Filter titles, excerpts, domains")
      .navigationTitle("Library")
      .background(HoardTheme.canvas)
    }
  }
}

struct InboxView: View {
  @Binding var count: Int
  @Environment(SessionStore.self) private var session
  @State private var model = ItemListModel()

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        ItemListContent(
          model: model,
          statusParam: "inbox",
          emptyTitle: "Inbox zero",
          emptyHint: "Fresh captures land here for triage.",
          emptyImage: "inbox",
          showFilterChips: false,
          onChanged: { refreshCount() }
        )
      }
      .searchable(text: $model.query, prompt: "Filter inbox")
      .navigationTitle("Inbox")
      .background(HoardTheme.canvas)
    }
    .task { refreshCount() }
    .onChange(of: model.items.count) { refreshCount() }
  }

  private func refreshCount() {
    count = model.items.count
  }
}
