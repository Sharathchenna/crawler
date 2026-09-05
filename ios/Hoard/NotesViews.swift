import SwiftUI
import KeepKit

struct NotesView: View {
  @Environment(SessionStore.self) private var session
  @State private var notes: [HoardNote] = []
  @State private var title = ""

  var body: some View {
    NavigationStack {
      List(notes) { note in
        NavigationLink { NoteEditorView(noteID: note.id) } label: {
          VStack(alignment: .leading) {
            Text(note.title).font(.inter(16, weight: .medium))
            Text("\(note.project.isEmpty ? "" : "\(note.project) · ")\(note.updatedAt.formatted(.relative(presentation: .named)))")
              .font(.mono(11)).foregroundStyle(.secondary)
          }
        }
      }
      .navigationTitle("Notes")
      .refreshable { await load() }
      .task { await load() }
      .safeAreaInset(edge: .top) {
        HStack {
          TextField("New note title…", text: $title)
            .textFieldStyle(.roundedBorder)
          Button("New note") {
            Task {
              if let n = try? await session.client.createNote(title: title.isEmpty ? "Untitled" : title) {
                title = ""
                await load()
              }
            }
          }.buttonStyle(.borderedProminent)
        }.padding([.horizontal, .top])
      }
    }
  }

  private func load() async {
    notes = (try? await session.client.notes()) ?? []
  }
}

struct NoteEditorView: View {
  @Environment(SessionStore.self) private var session
  var noteID: String
  @State private var note: HoardNote?
  @State private var draft = ""
  @State private var summary = ""
  @State private var preview = false
  @State private var status: String?
  @State private var error: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let note {
        Text("\(note.project.isEmpty ? "" : "project: \(note.project) · ")kind: \(note.kind) · \(note.sources?.count ?? 0) sources")
          .font(.mono(11)).foregroundStyle(.secondary)
        HStack {
          Button(preview ? "Edit" : "Preview") { preview.toggle() }.buttonStyle(.bordered).font(.mono(12))
          TextField("Revision summary", text: $summary).textFieldStyle(.roundedBorder).font(.mono(12))
          Button("Save") {
            Task {
              status = "Saving…"
              do {
                let updated = try await session.client.saveNote(id: noteID, markdown: draft, summary: summary.isEmpty ? "Edited" : summary)
                note = updated; draft = updated.markdown; summary = ""
                status = "Saved ✓ v\(updated.revisions?.count ?? 0)"
              } catch {
                status = error.localizedDescription
              }
            }
          }.buttonStyle(.borderedProminent)
        }
        if preview {
          ScrollView { Text((try? AttributedString(markdown: draft)) ?? AttributedString(draft)).frame(maxWidth: .infinity, alignment: .leading).padding() }
        } else {
          TextEditor(text: $draft).font(.mono(14)).border(Color.gray.opacity(0.3), width: 1)
        }
        if let status { Text(status).font(.mono(11)).foregroundStyle(.green) }
        Text("ACTIVITY").font(.mono(11)).foregroundStyle(.secondary).padding(.top, 4)
        List((note.revisions ?? []).reversed(), id: \.version) { r in
          Text("v\(r.version) · \(r.createdAt.formatted()) · \(r.author) · \(r.summary)").font(.mono(11))
        }
      } else if let error {
        Text(error).foregroundStyle(.red)
      } else {
        ProgressView()
      }
    }
    .padding()
    .navigationTitle(note?.title ?? "Note")
    .navigationBarTitleDisplayMode(.inline)
    .task {
      do {
        let n = try await session.client.note(id: noteID)
        note = n; draft = n.markdown
      } catch {
        self.error = error.localizedDescription
      }
    }
  }
}
