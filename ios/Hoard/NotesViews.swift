import SwiftUI
import KeepKit

struct NotesView: View {
  @Environment(SessionStore.self) private var session
  @State private var notes: [HoardNote] = []
  @State private var loading = false
  @State private var errorMessage: String?
  @State private var title = ""
  @State private var creating = false

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        if let errorMessage {
          ErrorBanner(errorMessage) { Task { await load() } }
            .padding([.horizontal, .top])
        }
        if loading && notes.isEmpty {
          VStack(spacing: 10) {
            ForEach(0..<5, id: \.self) { _ in
              RoundedRectangle(cornerRadius: 10).fill(HoardTheme.hover).frame(height: 64)
                .redacted(reason: .placeholder)
            }
          }
          .padding()
        } else if notes.isEmpty {
          EmptyState("No notes yet", hint: "Start one above — it becomes an agent-editable doc with revisions.", systemImage: "note.text")
            .padding()
        } else {
          List(notes) { note in
            NavigationLink { NoteEditorView(noteID: note.id) } label: {
              VStack(alignment: .leading, spacing: 3) {
                Text(note.title).font(.inter(15, weight: .medium)).foregroundStyle(HoardTheme.text)
                Text("\(note.project.isEmpty ? "" : "\(note.project) · ")\(note.timeAgo) · v\(note.revisionCount) · \(note.sourceCount) sources")
                  .font(.mono(11)).foregroundStyle(HoardTheme.faint)
              }
              .padding(.vertical, 3)
            }
            .listRowBackground(HoardTheme.raised)
          }
          .listStyle(.insetGrouped)
          .scrollContentBackground(.hidden)
          .refreshable { await load() }
        }
      }
      .navigationTitle("Notes")
      .background(HoardTheme.canvas)
      .safeAreaInset(edge: .top) {
        HStack(spacing: 8) {
          HStack(spacing: 8) {
            Image(systemName: "square.and.pencil").foregroundStyle(HoardTheme.faint)
            TextField("New note title…", text: $title)
              .font(.inter(14))
          }
          .padding(10)
          .background(HoardTheme.hover)
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
          Button(creating ? "…" : "New note") {
            Task { await create() }
          }
          .buttonStyle(.borderedProminent)
          .tint(HoardTheme.accent)
          .disabled(creating)
        }
        .padding([.horizontal, .top])
        .background(HoardTheme.canvas)
      }
      .task { await load() }
    }
  }

  private func load() async {
    loading = true; errorMessage = nil
    do {
      notes = try await session.client.notes()
    } catch {
      errorMessage = error.localizedDescription
    }
    loading = false
  }

  private func create() async {
    creating = true; errorMessage = nil
    do {
      _ = try await session.client.createNote(title: title.isEmpty ? "Untitled" : title)
      title = ""
      await load()
    } catch {
      errorMessage = error.localizedDescription
    }
    creating = false
  }
}

struct NoteEditorView: View {
  @Environment(SessionStore.self) private var session
  @Environment(\.dismiss) private var dismiss
  var noteID: String

  @State private var note: HoardNote?
  @State private var titleDraft = ""
  @State private var draft = ""
  @State private var summary = ""
  @State private var preview = false
  @State private var status: String?
  @State private var statusIsError = false
  @State private var loadError: String?
  @State private var saving = false

  var body: some View {
    ZStack {
      HoardTheme.canvas.ignoresSafeArea()
      VStack(alignment: .leading, spacing: 10) {
        if let current = note {
          Text("\(current.project.isEmpty ? "" : "project: \(current.project) · ")kind: \(current.kind) · \(current.sourceCount) sources")
            .font(.mono(11)).foregroundStyle(HoardTheme.faint)
          TextField("Title", text: $titleDraft)
            .font(.title(20))
            .foregroundStyle(HoardTheme.text)
          HStack(spacing: 8) {
            Button(preview ? "Edit" : "Preview") { preview.toggle() }
              .buttonStyle(.bordered).font(.mono(12))
            TextField("Revision summary", text: $summary)
              .textFieldStyle(.roundedBorder).font(.mono(12))
            Button(saving ? "…" : "Save") { Task { await save() } }
              .buttonStyle(.borderedProminent).tint(HoardTheme.accent)
              .disabled(saving)
          }
          if preview {
            ScrollView {
              HoardMarkdown(source: draft)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(HoardTheme.raised)
            .clipShape(RoundedRectangle(cornerRadius: 8))
          } else {
            TextEditor(text: $draft)
              .font(.mono(13))
              .scrollContentBackground(.hidden)
              .padding(8)
              .background(HoardTheme.hover)
              .clipShape(RoundedRectangle(cornerRadius: 8))
              .overlay(RoundedRectangle(cornerRadius: 8).stroke(HoardTheme.border, lineWidth: 1))
          }
          if let status {
            HStack(spacing: 6) {
              Image(systemName: statusIsError ? "exclamationmark.triangle" : "checkmark.circle.fill")
                .foregroundStyle(statusIsError ? HoardTheme.amber : HoardTheme.green)
                .font(.system(size: 11))
              Text(status).font(.mono(11)).foregroundStyle(HoardTheme.muted)
            }
          }
          Text("ACTIVITY").font(.mono(11)).foregroundStyle(HoardTheme.faint).padding(.top, 4)
          List((current.revisions ?? []).reversed(), id: \.version) { r in
            VStack(alignment: .leading, spacing: 2) {
              Text("v\(r.version) · \(r.author) · \(r.summary)")
                .font(.inter(13, weight: .medium)).foregroundStyle(HoardTheme.text)
              Text(r.createdAt.formatted()).font(.mono(11)).foregroundStyle(HoardTheme.faint)
            }
            .listRowBackground(HoardTheme.raised)
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .frame(minHeight: 120)
        } else if let loadError {
          ErrorBanner(loadError) { Task { await load() } }
        } else {
          ProgressView().tint(HoardTheme.accentHi)
        }
      }
      .padding()
    }
    .navigationTitle("Note")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Menu {
          Button(role: .destructive) { Task { await deleteNote() } } label: {
            Label("Delete note", systemImage: "trash")
          }
        } label: { Image(systemName: "ellipsis.circle") }
      }
    }
    .task { await load() }
  }

  private func load() async {
    loadError = nil
    do {
      let fetched = try await session.client.note(id: noteID)
      note = fetched
      draft = fetched.markdown
      titleDraft = fetched.title
    } catch {
      loadError = error.localizedDescription
    }
  }

  private func save() async {
    saving = true; status = "Saving…"; statusIsError = false
    do {
      let updated = try await session.client.saveNote(
        id: noteID,
        title: titleDraft.isEmpty ? nil : titleDraft,
        markdown: draft,
        summary: summary.isEmpty ? "Edited" : summary)
      note = updated
      draft = updated.markdown
      titleDraft = updated.title
      summary = ""
      status = "Saved ✓ v\(updated.revisionCount)"
    } catch {
      status = error.localizedDescription
      statusIsError = true
    }
    saving = false
  }

  private func deleteNote() async {
    do {
      try await session.client.deleteNote(id: noteID)
      dismiss()
    } catch {
      status = error.localizedDescription
      statusIsError = true
    }
  }
}
